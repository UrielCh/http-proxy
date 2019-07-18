import { EventEmitter } from 'events';
import { QueryInfo, RejectionReason } from './common';

export interface IProxyConfig {
    /**
     * Socket to liten for incomming query
     */
    XForwardedFor?: boolean;
    listen: { host: string; port: number, ipv6Only?: boolean, backlog?: number };
    allow?: (query: QueryInfo) => Promise<RejectionReason>;
  }
  
export interface ProxyConfigEvents {
    on(event: 'block', listener: (info: QueryInfo) => void): this;
    on(event: 'pass', listener: (info: QueryInfo) => void): this;
}

export class ProxyConfig extends EventEmitter implements IProxyConfig, ProxyConfigEvents {
    XForwardedFor?: boolean;
    listen: { host: string; port: number, ipv6Only?: boolean, backlog?: number };
    allow?: (query: QueryInfo) => Promise<RejectionReason>;
  
    constructor(base: IProxyConfig) {
      super();
      this.listen = base.listen;
      this.allow = base.allow;
    }
  }
  