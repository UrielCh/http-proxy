"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Proxy http + https
 */
const http = __importStar(require("http"));
const net = __importStar(require("net"));
const url_1 = require("url");
const proxyUtil_1 = require("./proxyUtil");
const decodeHttpsHost = proxyUtil_1.decoder_host(443);
const decode_host = proxyUtil_1.decoder_host(80);
class HttpProxy {
    constructor(proxyConfig) {
        this.UKey = 'n' + Math.random().toString(36).substring(2);
        this.proxyConfig = proxyConfig;
    }
    prevent_loop(request, response) {
        if (request.headers[this.UKey]) { //if request is already tooted => loop
            response.writeHead(500).end("Proxy loop !");
            return 'Loop detected';
        }
        else {
            // add a random tag
            request.headers[this.UKey] = '';
            return '';
        }
    }
    // security filter
    // true if OK
    // false to return immediatlely
    security_filter(request, response) {
        //HTTP 1.1 protocol violation: no host, no method, no url
        if (!request.headers.host || !request.method || !request.url) {
            proxyUtil_1.security_log(request, response, "Either host, method or url is poorly defined");
            response.end();
            return false;
        }
        return true;
    }
    // header decoding
    authenticate(request) {
        const token = {
            login: "anonymous",
            pass: ""
        };
        if (request.headers.authorization && request.headers.authorization.search('Basic ') === 0) {
            // fetch login and password
            let basic1 = (new Buffer(request.headers.authorization.split(' ')[1], 'base64').toString());
            console.error(`Authentication token received: ${basic1}`);
            let basic = basic1.split(':');
            token.login = basic[0];
            for (let i = 1; i < basic.length; i++) {
                token.pass += basic[i];
            }
        }
        return token;
    }
    handle_proxy_route(host, token) {
        // extract target host and port
        let action = decode_host(host);
        action.action = "proxyto"; // default action
        // try to find a matching rule
        // if (action.host + ':' + action.port in hostfilters){ // rule of the form "foo.domain.tld:port"
        //  rule = hostfilters[action.host+':'+action.port];
        //  action = handle_proxy_rule(rule, action, token);
        // } else if (action.host in hostfilters) { // rule of the form "foo.domain.tld"
        //  rule = hostfilters[action.host];
        //  action = handle_proxy_rule(rule, action, token);
        // } else if ("*:" + action.port in hostfilters) { //rule of the form "*:port"
        //  rule = hostfilters['*:'+action.port];
        //  action = handle_proxy_rule(rule, action, token);
        // } else if ("*" in hostfilters) { // default rule "*"
        //  rule = hostfilters['*'];
        //  action = handle_proxy_rule(rule, action, token);
        // }
        return action;
    }
    action_redirect(response, action) {
        const host = proxyUtil_1.encode_host(action);
        console.error(`Redirecting to ${host}`);
        response.writeHead(301, {
            Location: `http://${host}`
        }).end();
    }
    action_notfound(response, msg) {
        response.writeHead(404).end(msg);
    }
    action_proxy(request, response, host) {
        // console.error(`Proxying to ${host}`);
        // detect HTTP version
        let legacy_http = request.httpVersionMajor == 1 && request.httpVersionMinor < 1 || request.httpVersionMajor < 1;
        // launch new request + insert proxy specific header
        let headers = request.headers;
        if (this.proxyConfig.XForwardedFor) {
            if (headers['X-Forwarded-For']) {
                headers['X-Forwarded-For'] = request.connection.remoteAddress + ", " + headers['X-Forwarded-For'];
            }
            else {
                headers['X-Forwarded-For'] = request.connection.remoteAddress;
            }
        }
        const parsed = url_1.parse(request.url);
        const requestOptions = {
            method: request.method,
            hostname: host.hostname,
            port: host.port,
            path: parsed.path,
            headers: request.headers,
        };
        console.log(requestOptions);
        let proxy_request = http.request(requestOptions);
        //deal with errors, timeout, con refused, ...
        proxy_request.on('error', (err) => {
            console.error(`${err.toString()} on request to ${host}`);
            return this.action_notfound(response, `Requested resource (${request.url}) is not accessible on host "${host}"`);
        });
        //proxies to FORWARD answer to real client
        proxy_request.addListener('response', (proxyResponse) => {
            if (legacy_http && proxyResponse.headers['transfer-encoding'] != undefined) {
                console.log("legacy HTTP: " + request.httpVersion);
                // filter headers
                let headers = proxyResponse.headers;
                delete proxyResponse.headers['transfer-encoding'];
                let buffer = "";
                // buffer answer
                proxyResponse.addListener('data', (chunk) => buffer += chunk);
                proxyResponse.addListener('end', () => {
                    headers['Content-length'] = buffer.length.toString(); //cancel transfer encoding "chunked"
                    response.writeHead(proxyResponse.statusCode || 500, headers);
                    response.end(buffer, 'binary');
                });
            }
            else {
                // send headers as received
                response.writeHead(proxyResponse.statusCode || 500, proxyResponse.headers);
                // easy data forward
                proxyResponse.addListener('data', (chunk) => response.write(chunk, 'binary'));
                proxyResponse.addListener('end', () => response.end());
            }
        });
        // proxies to SEND request to real server
        request.addListener('data', (chunk) => proxy_request.write(chunk, 'binary'));
        request.addListener('end', () => proxy_request.end());
    }
    action_authenticate(response, msg) {
        response.writeHead(401, {
            'WWW-Authenticate': `Basic realm="${msg}"`
        }).end();
    }
    /**
     * HTTP support
     */
    async handlerHttp(request, response) {
        if (!this.security_filter(request, response)) {
            response.end();
            return;
        }
        const { hostname, port } = url_1.parse(request.url || '');
        let info = {
            domain: hostname || '',
            port: Number(port),
            ip: request.connection.remoteAddress,
        };
        if (this.proxyConfig.allow) {
            const rejection = await this.proxyConfig.allow(info);
            if (rejection) {
                proxyUtil_1.action_deny(response, rejection.message);
                proxyUtil_1.security_log(request, response, rejection.message);
                return;
            }
        }
        //loop filter
        let loopError = this.prevent_loop(request, response);
        if (loopError) {
            console.error(loopError);
            return;
        }
        //get authorization token
        let authorization = this.authenticate(request);
        // calc new host info
        let action = this.handle_proxy_route(request.headers.host, authorization);
        if (this.proxyConfig.allow) {
            const rejection = await this.proxyConfig.allow(info);
            if (rejection) {
                proxyUtil_1.action_deny(response, rejection.message);
                proxyUtil_1.security_log(request, response, rejection.message);
                return;
            }
        }
        //handle action
        if (action.action == "redirect") {
            this.action_redirect(response, action);
        }
        else if (action.action == "proxyto") {
            this.action_proxy(request, response, action);
        }
        else if (action.action == "authenticate") {
            this.action_authenticate(response, 'realm');
        }
    }
    /**
     * HTTPs support
     */
    async handlerHttps(request, clientSocket, head) {
        console.log(clientSocket.remoteAddress, clientSocket.remotePort, request.method, request.url);
        /*
        if (!req.headers['proxy-authorization']) { // here you can add check for any username/password, I just check that this header must exist!
          clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="proxy"\r\nProxy-Connection: close')
          clientSocket.end('\r\n\r\n')  // empty body
          return
        }*/
        //decode_host
        const { hostname, port } = decodeHttpsHost(request.url);
        if (!hostname || !port) {
            clientSocket.end('HTTP/1.1 400 Bad Request\r\n');
            clientSocket.destroy();
            return;
        }
        const query = { domain: hostname, port, ip: request.connection.remoteAddress };
        if (this.proxyConfig.allow) {
            const rejection = await this.proxyConfig.allow(query);
            if (rejection) {
                this.proxyConfig.emit('block', query);
                clientSocket.destroy();
                return;
            }
        }
        let serverSocket = net.connect(Number(port), hostname); // connect to destination host and port
        const end = (log) => {
            if (serverSocket) {
                if (log)
                    console.error('handlerHttps Error:', request.url, log);
                serverSocket.end();
                serverSocket = null;
            }
        };
        clientSocket.on('error', (err) => end(`HTTPS connecting ${hostname} failed with error:${err.message}`));
        clientSocket.on('end', () => end());
        serverSocket.on('error', (err) => end(err.message));
        serverSocket.on('end', () => end());
        serverSocket.on('connect', () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-agent: Node-Proxy');
            clientSocket.write('\r\n\r\n'); // empty body
            this.proxyConfig.emit('pass', query);
            // "blindly" (for performance) pipe client socket and destination socket between each other
            if (serverSocket) {
                serverSocket.pipe(clientSocket); // , {end: false}
                clientSocket.pipe(serverSocket); // , {end: false}
            }
        });
    }
    startServer() {
        const server = http.createServer((request, response) => this.handlerHttp(request, response))
            .listen(this.proxyConfig.listen, () => {
            console.log('Server is listening on address ', this.proxyConfig.listen);
        });
        /**
         * handle HTTPS
         * https://stackoverflow.com/questions/8165570/https-proxy-server-in-node-js
         */
        server.on('connect', (req, clientSocket, head) => this.handlerHttps(req, clientSocket, head));
    }
}
exports.HttpProxy = HttpProxy;
//# sourceMappingURL=HttpProxy.js.map