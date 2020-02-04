/**
 * common interfaces
 */
export interface AuthData {
    login: string;
    pass: string;
}
export interface RejectionReason {
    message: string;
}
export interface QueryInfo {
    domain: string;
    ip?: string;
    port?: number;
}
