/// <reference types="node" />
/**
 * Proxy http + https
 */
import * as http from 'http';
import * as net from 'net';
import { HostAction } from './proxyUtil';
import { AuthData } from './common';
import { ProxyConfig } from './ProxyConfig';
export declare class HttpProxy {
    private UKey;
    private proxyConfig;
    constructor(proxyConfig: ProxyConfig);
    prevent_loop(request: http.IncomingMessage, response: http.ServerResponse): string;
    security_filter(request: http.IncomingMessage, response: http.ServerResponse): boolean;
    authenticate(request: http.IncomingMessage): AuthData;
    handle_proxy_route(host: string, token: AuthData): HostAction;
    action_redirect(response: http.ServerResponse, action: HostAction): void;
    action_notfound(response: http.ServerResponse, msg: string): void;
    action_proxy(request: http.IncomingMessage, response: http.ServerResponse, host: HostAction): void;
    action_authenticate(response: http.ServerResponse, msg: string): void;
    /**
     * HTTP support
     */
    handlerHttp(request: http.IncomingMessage, response: http.ServerResponse): Promise<void>;
    /**
     * HTTPs support
     */
    handlerHttps(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): Promise<void>;
    startServer(): void;
}
