import { GraphQLSchema } from 'graphql';
import { Ignore, ExecuteFn, OnRoute, MethodMap } from './types';
import { ErrorHandler } from './express';
export interface SofaConfig {
    basePath: string;
    schema: GraphQLSchema;
    execute?: ExecuteFn;
    /**
     * Treats an Object with an ID as not a model.
     * @example ["User", "Message.author"]
     */
    ignore?: Ignore;
    onRoute?: OnRoute;
    depthLimit?: number;
    errorHandler?: ErrorHandler;
    /**
     * Overwrites the default HTTP method.
     * @example {"Query.field": "GET", "Mutation.field": "POST"}
     */
    method?: MethodMap;
}
export interface Sofa {
    basePath: string;
    schema: GraphQLSchema;
    models: string[];
    ignore: Ignore;
    depthLimit: number;
    method?: MethodMap;
    execute: ExecuteFn;
    onRoute?: OnRoute;
    errorHandler?: ErrorHandler;
}
export declare function createSofa(config: SofaConfig): Sofa;
