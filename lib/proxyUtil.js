"use strict";
// used in PROXY
Object.defineProperty(exports, "__esModule", { value: true });
// decode host and port info from header
exports.decoder_host = (defPort) => (host) => {
    if (!host)
        return { hostname: '', port: 0 };
    let split = host.split(':');
    if (split.length > 2)
        return { hostname: '', port: 0 };
    //throw 'Invalid hostname ' + host;
    let port = (split.length == 2) ? parseInt(split[1]) : defPort;
    return { hostname: split[0], port };
};
// encode host field
exports.encode_host = (host) => {
    if (host.port == 80)
        return host.hostname;
    return `${host.hostname}:${host.port}`;
};
// special security logging function
exports.security_log = (request, response, msg) => {
    // console.error(`**SECURITY VIOLATION** ${request.connection.remoteAddress}, ${request.method || "!NO METHOD!"} ${request.headers.host || "!NO HOST!"}=>${request.url || "!NO URL!"},${msg}`)
};
exports.action_deny = (response, msg) => {
    response.writeHead(403).end(msg);
};
exports.action_notfound = (response, msg) => {
    response.writeHead(404).end(msg);
};
//# sourceMappingURL=proxyUtil.js.map