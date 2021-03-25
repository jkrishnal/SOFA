import { __awaiter, __asyncValues, __rest } from 'tslib';
import { getOperationAST, Kind, isScalarType, isEqualType, GraphQLBoolean, isInputObjectType, subscribe, isObjectType, isNonNullType, print, graphql, getNamedType, isListType, isEnumType, parse, printType, isIntrospectionType } from 'graphql';
import * as Trouter from 'trouter';
import { buildOperationNodeForField } from '@graphql-tools/utils';
import { paramCase } from 'param-case';
import { v4 } from 'uuid';
import axios from 'axios';
import { red, yellow, green, blue } from 'ansi-colors';
import { dump } from 'js-yaml';
import { writeFileSync } from 'fs';
import { titleCase } from 'title-case';

function getOperationInfo(doc) {
    const op = getOperationAST(doc, null);
    if (!op) {
        return;
    }
    return {
        operation: op,
        name: op.name.value,
        variables: op.variableDefinitions || [],
    };
}

function convertName(name) {
    return paramCase(name);
}
function isNil(val) {
    return val == null;
}

function parseVariable({ value, variable, schema, }) {
    if (isNil(value)) {
        return;
    }
    return resolveVariable({
        value,
        type: variable.type,
        schema,
    });
}
function resolveVariable({ value, type, schema, }) {
    if (type.kind === Kind.NAMED_TYPE) {
        const namedType = schema.getType(type.name.value);
        if (isScalarType(namedType)) {
            // GraphQLBoolean.serialize expects a boolean or a number only
            if (isEqualType(GraphQLBoolean, namedType)) {
                // we don't support TRUE
                value = value === 'true';
            }
            return namedType.serialize(value);
        }
        if (isInputObjectType(namedType)) {
            return value && typeof value === 'object' ? value : JSON.parse(value);
        }
        return value;
    }
    if (type.kind === Kind.LIST_TYPE) {
        return value.map(val => resolveVariable({
            value: val,
            type: type.type,
            schema,
        }));
    }
    if (type.kind === Kind.NON_NULL_TYPE) {
        return resolveVariable({
            value: value,
            type: type.type,
            schema,
        });
    }
}

var _a;
const levels = ['error', 'warn', 'info', 'debug'];
const toLevel = (string) => levels.includes(string) ? string : null;
const currentLevel = process.env.SOFA_DEBUG
    ? 'debug'
    : (_a = toLevel(process.env.SOFA_LOGGER_LEVEL)) !== null && _a !== void 0 ? _a : 'info';
const log = (level, color, args) => {
    if (levels.indexOf(level) <= levels.indexOf(currentLevel)) {
        console.log(`${color(level)}:`, ...args);
    }
};
const logger = {
    error: (...args) => {
        log('error', red, args);
    },
    warn: (...args) => {
        log('warn', yellow, args);
    },
    info: (...args) => {
        log('info', green, args);
    },
    debug: (...args) => {
        log('debug', blue, args);
    },
};

function isAsyncIterable(obj) {
    return typeof obj[Symbol.asyncIterator] === 'function';
}
class SubscriptionManager {
    constructor(sofa) {
        this.sofa = sofa;
        this.operations = new Map();
        this.clients = new Map();
        this.buildOperations();
    }
    start(event, contextValue) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = v4();
            const name = event.subscription;
            if (!this.operations.has(name)) {
                throw new Error(`Subscription '${name}' is not available`);
            }
            const { document, operationName, variables } = this.operations.get(name);
            logger.info(`[Subscription] Start ${id}`, event);
            const result = yield this.execute({
                id,
                name,
                url: event.url,
                document,
                operationName,
                variables,
                contextValue,
            });
            if (typeof result !== 'undefined') {
                return result;
            }
            return { id };
        });
    }
    stop(id) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.info(`[Subscription] Stop ${id}`);
            if (!this.clients.has(id)) {
                throw new Error(`Subscription with ID '${id}' does not exist`);
            }
            const execution = this.clients.get(id);
            if (execution.iterator.return) {
                execution.iterator.return();
            }
            this.clients.delete(id);
            return { id };
        });
    }
    update(event, contextValue) {
        return __awaiter(this, void 0, void 0, function* () {
            const { variables, id } = event;
            logger.info(`[Subscription] Update ${id}`, event);
            if (!this.clients.has(id)) {
                throw new Error(`Subscription with ID '${id}' does not exist`);
            }
            const { name: subscription, url } = this.clients.get(id);
            this.stop(id);
            return this.start({
                url,
                subscription,
                variables,
            }, contextValue);
        });
    }
    execute({ id, document, name, url, operationName, variables, contextValue, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const variableNodes = this.operations.get(name).variables;
            const variableValues = variableNodes.reduce((values, variable) => {
                const value = parseVariable({
                    value: variables[variable.variable.name.value],
                    variable,
                    schema: this.sofa.schema,
                });
                if (typeof value === 'undefined') {
                    return values;
                }
                return Object.assign(Object.assign({}, values), { [name]: value });
            }, {});
            const execution = yield subscribe({
                schema: this.sofa.schema,
                document,
                operationName,
                variableValues,
                contextValue,
            });
            if (isAsyncIterable(execution)) {
                // successful
                // add execution to clients
                this.clients.set(id, {
                    name,
                    url,
                    iterator: execution,
                });
                // success
                (() => __awaiter(this, void 0, void 0, function* () {
                    var e_1, _a;
                    try {
                        for (var execution_1 = __asyncValues(execution), execution_1_1; execution_1_1 = yield execution_1.next(), !execution_1_1.done;) {
                            const result = execution_1_1.value;
                            yield this.sendData({
                                id,
                                result,
                            });
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (execution_1_1 && !execution_1_1.done && (_a = execution_1.return)) yield _a.call(execution_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }))().then(() => {
                    // completes
                    this.clients.delete(id);
                }, (e) => {
                    logger.info(`Subscription #${id} closed`);
                    logger.error(e);
                    this.clients.delete(id);
                });
            }
            else {
                return execution;
            }
        });
    }
    sendData({ id, result }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.clients.has(id)) {
                throw new Error(`Subscription with ID '${id}' does not exist`);
            }
            const { url } = this.clients.get(id);
            logger.info(`[Subscription] Trigger ${id}`);
            yield axios.post(url, result);
        });
    }
    buildOperations() {
        const subscription = this.sofa.schema.getSubscriptionType();
        if (!subscription) {
            return;
        }
        const fieldMap = subscription.getFields();
        for (const field in fieldMap) {
            const operationNode = buildOperationNodeForField({
                kind: 'subscription',
                field,
                schema: this.sofa.schema,
                models: this.sofa.models,
                ignore: this.sofa.ignore,
                circularReferenceDepth: this.sofa.depthLimit,
            });
            const document = {
                kind: Kind.DOCUMENT,
                definitions: [operationNode],
            };
            const { variables, name: operationName } = getOperationInfo(document);
            this.operations.set(field, {
                operationName,
                document,
                variables,
            });
        }
    }
}

function createRouter(sofa) {
    logger.debug('[Sofa] Creating router');
    const router = new Trouter();
    const queryType = sofa.schema.getQueryType();
    const mutationType = sofa.schema.getMutationType();
    const subscriptionManager = new SubscriptionManager(sofa);
    if (queryType) {
        Object.keys(queryType.getFields()).forEach((fieldName) => {
            const route = createQueryRoute({ sofa, router, fieldName });
            if (sofa.onRoute) {
                sofa.onRoute(route);
            }
        });
    }
    if (mutationType) {
        Object.keys(mutationType.getFields()).forEach((fieldName) => {
            const route = createMutationRoute({ sofa, router, fieldName });
            if (sofa.onRoute) {
                sofa.onRoute(route);
            }
        });
    }
    router.post('/webhook', ({ body, contextValue }) => __awaiter(this, void 0, void 0, function* () {
        const { subscription, variables, url } = body;
        try {
            const result = yield subscriptionManager.start({
                subscription,
                variables,
                url,
            }, contextValue);
            return {
                type: 'result',
                status: 200,
                statusMessage: 'OK',
                body: result,
            };
        }
        catch (error) {
            return {
                type: 'error',
                status: 500,
                statusMessage: 'Subscription failed',
                error,
            };
        }
    }));
    router.post('/webhook/:id', ({ body, params, contextValue }) => __awaiter(this, void 0, void 0, function* () {
        const id = params.id;
        const variables = body.variables;
        try {
            const result = yield subscriptionManager.update({
                id,
                variables,
            }, contextValue);
            return {
                type: 'result',
                status: 200,
                statusMessage: 'OK',
                body: result,
            };
        }
        catch (error) {
            return {
                type: 'error',
                status: 500,
                statusMessage: 'Subscription failed to update',
                error,
            };
        }
    }));
    router.delete('/webhook/:id', ({ params }) => __awaiter(this, void 0, void 0, function* () {
        const id = params.id;
        try {
            const result = yield subscriptionManager.stop(id);
            return {
                type: 'result',
                status: 200,
                statusMessage: 'OK',
                body: result,
            };
        }
        catch (error) {
            return {
                type: 'error',
                status: 500,
                statusMessage: 'Subscription failed to stop',
                error,
            };
        }
    }));
    return ({ method, url, body, contextValue }) => __awaiter(this, void 0, void 0, function* () {
        if (!url.startsWith(sofa.basePath)) {
            return null;
        }
        // trim base path and search
        const [slicedUrl] = url.slice(sofa.basePath.length).split('?');
        const trouterMethod = method.toUpperCase();
        const obj = router.find(trouterMethod, slicedUrl);
        for (const handler of obj.handlers) {
            return yield handler({
                url,
                body,
                params: obj.params,
                contextValue,
            });
        }
        return null;
    });
}
function createQueryRoute({ sofa, router, fieldName, }) {
    logger.debug(`[Router] Creating ${fieldName} query`);
    const queryType = sofa.schema.getQueryType();
    const operationNode = buildOperationNodeForField({
        kind: 'query',
        schema: sofa.schema,
        field: fieldName,
        models: sofa.models,
        ignore: sofa.ignore,
        circularReferenceDepth: sofa.depthLimit,
    });
    const operation = {
        kind: Kind.DOCUMENT,
        definitions: [operationNode],
    };
    const info = getOperationInfo(operation);
    const field = queryType.getFields()[fieldName];
    const fieldType = field.type;
    const isSingle = isObjectType(fieldType) ||
        (isNonNullType(fieldType) && isObjectType(fieldType.ofType));
    const hasIdArgument = field.args.some((arg) => arg.name === 'id');
    const path = getPath(fieldName, isSingle && hasIdArgument);
    const method = produceMethod({
        typeName: queryType.name,
        fieldName,
        methodMap: sofa.method,
        defaultValue: 'GET',
    });
    router[method.toLocaleLowerCase()](path, useHandler({ info, fieldName, sofa, operation }));
    logger.debug(`[Router] ${fieldName} query available at ${method} ${path}`);
    return {
        document: operation,
        path,
        method: method.toUpperCase(),
    };
}
function createMutationRoute({ sofa, router, fieldName, }) {
    logger.debug(`[Router] Creating ${fieldName} mutation`);
    const mutationType = sofa.schema.getMutationType();
    const operationNode = buildOperationNodeForField({
        kind: 'mutation',
        schema: sofa.schema,
        field: fieldName,
        models: sofa.models,
        ignore: sofa.ignore,
        circularReferenceDepth: sofa.depthLimit,
    });
    const operation = {
        kind: Kind.DOCUMENT,
        definitions: [operationNode],
    };
    const info = getOperationInfo(operation);
    const path = getPath(fieldName);
    const method = produceMethod({
        typeName: mutationType.name,
        fieldName,
        methodMap: sofa.method,
        defaultValue: 'POST',
    });
    router[method.toLowerCase()](path, useHandler({ info, fieldName, sofa, operation }));
    logger.debug(`[Router] ${fieldName} mutation available at ${method} ${path}`);
    return {
        document: operation,
        path,
        method: method.toUpperCase(),
    };
}
function useHandler(config) {
    const { sofa, operation, fieldName } = config;
    const info = config.info;
    return ({ url, body, params, contextValue }) => __awaiter(this, void 0, void 0, function* () {
        const variableValues = info.variables.reduce((variables, variable) => {
            const name = variable.variable.name.value;
            const value = parseVariable({
                value: pickParam({ url, body, params, name }),
                variable,
                schema: sofa.schema,
            });
            if (typeof value === 'undefined') {
                return variables;
            }
            return Object.assign(Object.assign({}, variables), { [name]: value });
        }, {});
        const result = yield sofa.execute({
            schema: sofa.schema,
            source: print(operation),
            contextValue,
            variableValues,
            operationName: info.operation.name && info.operation.name.value,
        });
        if (result.errors) {
            const defaultErrorHandler = (errors) => {
                return {
                    type: 'error',
                    status: 500,
                    error: errors[0],
                };
            };
            const errorHandler = sofa.errorHandler || defaultErrorHandler;
            return errorHandler(result.errors);
        }
        return {
            type: 'result',
            status: 200,
            body: result.data && result.data[fieldName],
        };
    });
}
function getPath(fieldName, hasId = false) {
    return `/${convertName(fieldName)}${hasId ? '/:id' : ''}`;
}
function pickParam({ name, url, params, body, }) {
    if (params && params.hasOwnProperty(name)) {
        return params[name];
    }
    const searchParams = new URLSearchParams(url.split('?')[1]);
    if (searchParams.has(name)) {
        return searchParams.get(name);
    }
    if (body && body.hasOwnProperty(name)) {
        return body[name];
    }
}
function produceMethod({ typeName, fieldName, methodMap, defaultValue, }) {
    const path = `${typeName}.${fieldName}`;
    if (methodMap && methodMap[path]) {
        return methodMap[path];
    }
    return defaultValue;
}

function createSofa(config) {
    logger.debug('[Sofa] Created');
    const models = extractsModels(config.schema);
    const ignore = config.ignore || [];
    const depthLimit = config.depthLimit || 1;
    logger.debug(`[Sofa] models: ${models.join(', ')}`);
    logger.debug(`[Sofa] ignore: ${ignore.join(', ')}`);
    return Object.assign({ execute: graphql, models,
        ignore,
        depthLimit }, config);
}
// Objects and Unions are the only things that are used to define return types
// and both might contain an ID
// We don't treat Unions as models because
// they might represent an Object that is not a model
// We check it later, when an operation is being built
function extractsModels(schema) {
    const modelMap = {};
    const query = schema.getQueryType();
    const fields = query.getFields();
    // if Query[type] (no args) and Query[type](just id as an argument)
    // loop through every field
    for (const fieldName in fields) {
        const field = fields[fieldName];
        const namedType = getNamedType(field.type);
        if (hasID(namedType)) {
            if (!modelMap[namedType.name]) {
                modelMap[namedType.name] = {};
            }
            if (isArrayOf(field.type, namedType)) {
                // check if type is a list
                // check if name of a field matches a name of a named type (in plural)
                // check if has no non-optional arguments
                // add to registry with `list: true`
                const sameName = isNameEqual(field.name, namedType.name + 's');
                const allOptionalArguments = !field.args.some((arg) => isNonNullType(arg.type));
                modelMap[namedType.name].list = sameName && allOptionalArguments;
            }
            else if (isObjectType(field.type) ||
                (isNonNullType(field.type) && isObjectType(field.type.ofType))) {
                // check if type is a graphql object type
                // check if name of a field matches with name of an object type
                // check if has only one argument named `id`
                // add to registry with `single: true`
                const sameName = isNameEqual(field.name, namedType.name);
                const hasIdArgument = field.args.length === 1 && field.args[0].name === 'id';
                modelMap[namedType.name].single = sameName && hasIdArgument;
            }
        }
    }
    return Object.keys(modelMap).filter((name) => modelMap[name].list && modelMap[name].single);
}
// it's dumb but let's leave it for now
function isArrayOf(type, expected) {
    if (isOptionalList(type)) {
        return true;
    }
    if (isNonNullType(type) && isOptionalList(type.ofType)) {
        return true;
    }
    function isOptionalList(list) {
        if (isListType(list)) {
            if (list.ofType.name === expected.name) {
                return true;
            }
            if (isNonNullType(list.ofType) &&
                list.ofType.ofType.name === expected.name) {
                return true;
            }
        }
    }
    return false;
}
function hasID(type) {
    return isObjectType(type) && !!type.getFields().id;
}
function isNameEqual(a, b) {
    return convertName(a) === convertName(b);
}

function mapToPrimitive(type) {
    const formatMap = {
        Int: {
            type: 'integer',
            format: 'int32',
        },
        Float: {
            type: 'number',
            format: 'float',
        },
        String: {
            type: 'string',
        },
        Boolean: {
            type: 'boolean',
        },
        ID: {
            type: 'string',
        },
    };
    if (formatMap[type]) {
        return formatMap[type];
    }
}
function mapToRef(type) {
    return `#/components/schemas/${type}`;
}

function buildSchemaObjectFromType(type) {
    const required = [];
    const properties = {};
    const fields = type.getFields();
    for (const fieldName in fields) {
        const field = fields[fieldName];
        if (isNonNullType(field.type)) {
            required.push(field.name);
        }
        properties[fieldName] = resolveField(field);
        if (field.description) {
            properties[fieldName].description = field.description;
        }
    }
    return Object.assign(Object.assign(Object.assign({ type: 'object' }, (required.length ? { required } : {})), { properties }), (type.description ? { description: type.description } : {}));
}
function resolveField(field) {
    return resolveFieldType(field.type);
}
// array -> [type]
// type -> $ref
// scalar -> swagger primitive
function resolveFieldType(type) {
    var _a, _b;
    if (isNonNullType(type)) {
        return resolveFieldType(type.ofType);
    }
    if (isListType(type)) {
        return {
            type: 'array',
            items: resolveFieldType(type.ofType),
        };
    }
    if (isObjectType(type)) {
        return {
            $ref: mapToRef(type.name),
        };
    }
    if (isScalarType(type)) {
        return (mapToPrimitive(type.name) || {
            type: 'object',
        });
    }
    if (isEnumType(type)) {
        return {
            type: 'string',
            enum: (_b = (_a = type.astNode) === null || _a === void 0 ? void 0 : _a.values) === null || _b === void 0 ? void 0 : _b.map((value) => value.name.value),
        };
    }
    return {
        type: 'object',
    };
}

function buildPathFromOperation({ url, schema, operation, useRequestBody, }) {
    const info = getOperationInfo(operation);
    const description = resolveDescription(schema, info.operation);
    return Object.assign(Object.assign({ operationId: info.name }, (useRequestBody
        ? {
            requestBody: {
                content: {
                    'application/json': {
                        schema: resolveRequestBody(info.operation.variableDefinitions),
                    },
                },
            },
        }
        : {
            parameters: resolveParameters(url, info.operation.variableDefinitions),
        })), { responses: {
            200: {
                description,
                content: {
                    'application/json': {
                        schema: resolveResponse({
                            schema,
                            operation: info.operation,
                        }),
                    },
                },
            },
        } });
}
function resolveParameters(url, variables) {
    if (!variables) {
        return [];
    }
    return variables.map((variable) => {
        return {
            in: isInPath(url, variable.variable.name.value) ? 'path' : 'query',
            name: variable.variable.name.value,
            required: variable.type.kind === Kind.NON_NULL_TYPE,
            schema: resolveParamSchema(variable.type),
        };
    });
}
function resolveRequestBody(variables) {
    if (!variables) {
        return {};
    }
    const properties = {};
    const required = [];
    variables.forEach(variable => {
        if (variable.type.kind === Kind.NON_NULL_TYPE) {
            required.push(variable.variable.name.value);
        }
        properties[variable.variable.name.value] = resolveParamSchema(variable.type);
    });
    return Object.assign({ type: 'object', properties }, (required.length ? { required } : {}));
}
// array -> [type]
// type -> $ref
// scalar -> swagger primitive
function resolveParamSchema(type) {
    if (type.kind === Kind.NON_NULL_TYPE) {
        return resolveParamSchema(type.type);
    }
    if (type.kind === Kind.LIST_TYPE) {
        return {
            type: 'array',
            items: resolveParamSchema(type.type),
        };
    }
    const primitive = mapToPrimitive(type.name.value);
    return (primitive || {
        $ref: mapToRef(type.name.value),
    });
}
function resolveResponse({ schema, operation, }) {
    const operationType = operation.operation;
    const rootField = operation.selectionSet.selections[0];
    if (rootField.kind === Kind.FIELD) {
        if (operationType === 'query') {
            const queryType = schema.getQueryType();
            const field = queryType.getFields()[rootField.name.value];
            return resolveFieldType(field.type);
        }
        if (operationType === 'mutation') {
            const mutationType = schema.getMutationType();
            const field = mutationType.getFields()[rootField.name.value];
            return resolveFieldType(field.type);
        }
    }
}
function isInPath(url, param) {
    return url.indexOf(`{${param}}`) !== -1;
}
function resolveDescription(schema, operation) {
    const selection = operation.selectionSet.selections[0];
    const fieldName = selection.name.value;
    const typeDefinition = schema.getType(titleCase(operation.operation));
    if (!typeDefinition) {
        return '';
    }
    const definitionNode = typeDefinition.astNode || parse(printType(typeDefinition)).definitions[0];
    if (!isObjectTypeDefinitionNode(definitionNode)) {
        return '';
    }
    const fieldNode = definitionNode.fields.find(field => field.name.value === fieldName);
    const descriptionDefinition = fieldNode && fieldNode.description;
    return descriptionDefinition && descriptionDefinition.value
        ? descriptionDefinition.value
        : '';
}
function isObjectTypeDefinitionNode(node) {
    return node.kind === Kind.OBJECT_TYPE_DEFINITION;
}

function OpenAPI({ schema, info, servers, components, security, tags, }) {
    const types = schema.getTypeMap();
    const swagger = {
        openapi: '3.0.0',
        info,
        servers,
        tags,
        paths: {},
        components: {
            schemas: {},
        },
    };
    for (const typeName in types) {
        const type = types[typeName];
        if ((isObjectType(type) || isInputObjectType(type)) &&
            !isIntrospectionType(type)) {
            swagger.components.schemas[typeName] = buildSchemaObjectFromType(type);
        }
    }
    if (components) {
        swagger.components = Object.assign(Object.assign({}, components), swagger.components);
    }
    if (security) {
        swagger.security = security;
    }
    return {
        addRoute(info, config) {
            const basePath = (config === null || config === void 0 ? void 0 : config.basePath) || '';
            const path = basePath +
                info.path.replace(/\:[a-z0-9]+\w/i, (param) => `{${param.replace(':', '')}}`);
            if (!swagger.paths[path]) {
                swagger.paths[path] = {};
            }
            swagger.paths[path][info.method.toLowerCase()] = buildPathFromOperation({
                url: path,
                operation: info.document,
                schema,
                useRequestBody: ['POST', 'PUT', 'PATCH'].includes(info.method),
            });
        },
        get() {
            return swagger;
        },
        save(filepath) {
            const isJSON = /\.json$/i;
            const isYAML = /.ya?ml$/i;
            if (isJSON.test(filepath)) {
                writeOutput(filepath, JSON.stringify(swagger, null, 2));
            }
            else if (isYAML.test(filepath)) {
                writeOutput(filepath, dump(swagger));
            }
            else {
                throw new Error('We only support JSON and YAML files');
            }
        },
    };
}
function writeOutput(filepath, contents) {
    writeFileSync(filepath, contents, {
        encoding: 'utf-8',
    });
}

function isContextFn(context) {
    return typeof context === 'function';
}
function useSofa(_a) {
    var { context } = _a, config = __rest(_a, ["context"]);
    const invokeSofa = createSofaRouter(config);
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        var _b;
        try {
            let contextValue = { req };
            if (context) {
                if (typeof context === 'function') {
                    contextValue = yield context({ req, res });
                }
                else {
                    contextValue = context;
                }
            }
            const response = yield invokeSofa({
                method: req.method,
                url: (_b = req.originalUrl) !== null && _b !== void 0 ? _b : req.url,
                body: req.body,
                contextValue,
            });
            if (response == null) {
                next();
            }
            else {
                const headers = {
                    'Content-Type': 'application/json',
                };
                if (response.statusMessage) {
                    res.writeHead(response.status, response.statusMessage, headers);
                }
                else {
                    res.writeHead(response.status, headers);
                }
                if (response.type === 'result') {
                    res.end(JSON.stringify(response.body));
                }
                if (response.type === 'error') {
                    res.end(JSON.stringify(response.error));
                }
            }
        }
        catch (error) {
            next(error);
        }
    });
}
function createSofaRouter(config) {
    const sofa = createSofa(config);
    const router = createRouter(sofa);
    return router;
}

export { OpenAPI, createSofaRouter, isContextFn, useSofa };
//# sourceMappingURL=index.esm.js.map
