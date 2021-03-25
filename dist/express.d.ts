import { Sofa } from './sofa';
import { ContextValue } from './types';
export declare type ErrorHandler = (errors: ReadonlyArray<any>) => RouterError;
declare type RouterRequest = {
    method: string;
    url: string;
    body: any;
    contextValue: ContextValue;
};
declare type RouterResult = {
    type: 'result';
    status: number;
    statusMessage?: string;
    body: any;
};
declare type RouterError = {
    type: 'error';
    status: number;
    statusMessage?: string;
    error: any;
};
declare type RouterResponse = RouterResult | RouterError;
declare type Router = (request: RouterRequest) => Promise<null | RouterResponse>;
export declare function createRouter(sofa: Sofa): Router;
export {};
