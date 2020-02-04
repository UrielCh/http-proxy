// used in PROXY

import * as http from 'http';

export interface HostAction {
    hostname: string;
    port: number;
    action?: string;
}

// decode host and port info from header
export const decoder_host = (defPort:number) => (host?: string) : HostAction => {
    if (!host)
      return { hostname: '', port : 0 }
    let split = host.split(':');
    if (split.length > 2)
      return { hostname: '', port : 0 }
      //throw 'Invalid hostname ' + host;
    let port = (split.length == 2) ? parseInt(split[1]) : defPort;
    return { hostname: split[0], port }
  }
  
// encode host field
export const encode_host = (host: HostAction) => {
    if (host.port == 80)
      return host.hostname;
    return `${host.hostname}:${host.port}`;
  }
  
// special security logging function
export const security_log = (request: http.IncomingMessage, response: http.ServerResponse, msg: string) => {
    // console.error(`**SECURITY VIOLATION** ${request.connection.remoteAddress}, ${request.method || "!NO METHOD!"} ${request.headers.host || "!NO HOST!"}=>${request.url || "!NO URL!"},${msg}`)
}
  
export const action_deny = (response: http.ServerResponse, msg: string) => {
  response.writeHead(403).end(msg);
}

export const action_notfound = (response: http.ServerResponse, msg: string) => {
  response.writeHead(404).end(msg);
}

