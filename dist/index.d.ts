/// <reference types="node" />
import * as http from 'http';
import type { ContextValue } from './types';
import type { SofaConfig } from './sofa';
export { OpenAPI } from './open-api';
declare type Request = http.IncomingMessage & {
    method: string;
    url: string;
    originalUrl?: string;
    body?: any;
};
declare type NextFunction = (err?: any) => void;
declare type Middleware = (req: Request, res: http.ServerResponse, next: NextFunction) => unknown;
export declare type ContextFn = (init: {
    req: any;
    res: any;
}) => ContextValue;
export declare function isContextFn(context: any): context is ContextFn;
interface SofaMiddlewareConfig extends SofaConfig {
    context?: ContextValue | ContextFn;
}
export declare function useSofa({ context, ...config }: SofaMiddlewareConfig): Middleware;
export declare function createSofaRouter(config: SofaConfig): (request: {
    method: string;
    url: string;
    body: any;
    contextValue: ContextValue;
}) => Promise<({
    type: "result";
    status: number;
    statusMessage?: string | undefined;
    body: any;
} | {
    type: "error";
    status: number;
    statusMessage?: string | undefined;
    error: any;
}) | null>;
