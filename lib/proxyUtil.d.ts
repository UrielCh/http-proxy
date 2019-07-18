/// <reference types="node" />
import * as http from 'http';
export interface HostAction {
    hostname: string;
    port: number;
    action?: string;
}
export declare const decoder_host: (defPort: number) => (host?: string | undefined) => HostAction;
export declare const encode_host: (host: HostAction) => string;
export declare const security_log: (request: http.IncomingMessage, response: http.ServerResponse, msg: string) => void;
export declare const action_deny: (response: http.ServerResponse, msg: string) => void;
export declare const action_notfound: (response: http.ServerResponse, msg: string) => void;
