import { GraphQLArgs, ExecutionResult, DocumentNode } from 'graphql';
export declare type ContextValue = Record<string, any>;
export declare type Ignore = string[];
export declare type ExecuteFn = (args: GraphQLArgs) => Promise<ExecutionResult<any>>;
export declare type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export interface RouteInfo {
    document: DocumentNode;
    path: string;
    method: Method;
}
export declare type OnRoute = (info: RouteInfo) => void;
export declare type MethodMap = Record<string, Method>;
