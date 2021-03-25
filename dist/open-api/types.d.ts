import { GraphQLObjectType, GraphQLInputObjectType, GraphQLOutputType, GraphQLNamedType } from 'graphql';
export declare function buildSchemaObjectFromType(type: GraphQLObjectType | GraphQLInputObjectType): any;
export declare function resolveFieldType(type: GraphQLOutputType | GraphQLNamedType): any;
