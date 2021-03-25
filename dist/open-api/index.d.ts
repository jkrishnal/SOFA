import { GraphQLSchema } from 'graphql';
import { RouteInfo } from '../types';
export declare function OpenAPI({ schema, info, servers, components, security, tags, }: {
    schema: GraphQLSchema;
    info: Record<string, any>;
    servers?: Record<string, any>[];
    components?: Record<string, any>;
    security?: Record<string, any>[];
    tags?: Record<string, any>[];
}): {
    addRoute(info: RouteInfo, config?: {
        basePath?: string | undefined;
    } | undefined): void;
    get(): any;
    save(filepath: string): void;
};
