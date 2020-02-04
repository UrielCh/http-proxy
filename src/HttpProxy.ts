/**
 * Proxy http + https
 */
import * as http from 'http'
import * as net from 'net'
import { parse } from 'url'
import { decoder_host, encode_host, security_log, action_deny, HostAction } from './proxyUtil';
import { RequestOptions } from 'https';
import { QueryInfo, AuthData } from './common';
import { ProxyConfig } from './ProxyConfig';

const decodeHttpsHost = decoder_host(443);
const decode_host = decoder_host(80);

export class HttpProxy {
  private UKey = 'n' + Math.random().toString(36).substring(2)

  private proxyConfig: ProxyConfig;
  constructor(proxyConfig: ProxyConfig) {
    this.proxyConfig = proxyConfig;
  }

  prevent_loop(request: http.IncomingMessage, response: http.ServerResponse): string {
    if (request.headers[this.UKey]) {//if request is already tooted => loop
      response.writeHead(500).end("Proxy loop !");
      return 'Loop detected';
    } else {
      // add a random tag
      request.headers[this.UKey] = '';
      return '';
    }
  }
  // security filter
  // true if OK
  // false to return immediatlely
  security_filter(request: http.IncomingMessage, response: http.ServerResponse): boolean {
    //HTTP 1.1 protocol violation: no host, no method, no url
    if (!request.headers.host || !request.method || !request.url) {
      security_log(request, response, "Either host, method or url is poorly defined")
      response.end()
      return false;
    }
    return true;
  }

  // header decoding
  authenticate(request: http.IncomingMessage): AuthData {
    const token: AuthData = {
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

  handle_proxy_route(host: string, token: AuthData): HostAction {
    // extract target host and port
    let action: HostAction = decode_host(host);
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

  action_redirect(response: http.ServerResponse, action: HostAction) {
    const host = encode_host(action);
    console.error(`Redirecting to ${host}`);
    response.writeHead(301, {
      Location: `http://${host}`
    }).end();
  }

  action_notfound(response: http.ServerResponse, msg: string) {
    response.writeHead(404).end(msg);
  }

  action_proxy(request: http.IncomingMessage, response: http.ServerResponse, host: HostAction) {
    console.error(`Proxying to ${host}`);
    // detect HTTP version
    let legacy_http = request.httpVersionMajor == 1 && request.httpVersionMinor < 1 || request.httpVersionMajor < 1;
    // launch new request + insert proxy specific header
    let headers = request.headers;

    if (this.proxyConfig.XForwardedFor) {
      if (headers['X-Forwarded-For']) {
        headers['X-Forwarded-For'] = request.connection.remoteAddress + ", " + headers['X-Forwarded-For'];
      } else {
        headers['X-Forwarded-For'] = request.connection.remoteAddress;
      }
    }
    const parsed = parse(request.url as string);
    const requestOptions: RequestOptions = {
      method: request.method,
      hostname: host.hostname,
      port: host.port,
      path: parsed.path,
      headers: request.headers,
    };
    console.log(requestOptions);
    let proxy_request = http.request(requestOptions);
    //deal with errors, timeout, con refused, ...
    proxy_request.on('error', (err: Error) => {
      console.error(`${err.toString()} on request to ${host}`);
      return this.action_notfound(response, `Requested resource (${request.url}) is not accessible on host "${host}"`);
    });
    //proxies to FORWARD answer to real client
    proxy_request.addListener('response', (proxyResponse: http.IncomingMessage) => {
      if (legacy_http && proxyResponse.headers['transfer-encoding'] != undefined) {
        console.log("legacy HTTP: " + request.httpVersion);
        // filter headers
        let headers = proxyResponse.headers;
        delete proxyResponse.headers['transfer-encoding'];
        let buffer = "";
        // buffer answer
        proxyResponse.addListener('data', (chunk) => buffer += chunk);
        proxyResponse.addListener('end', () => {
          headers['Content-length'] = buffer.length.toString();//cancel transfer encoding "chunked"
          response.writeHead(proxyResponse.statusCode || 500, headers);
          response.end(buffer, 'binary');
        });
      } else {
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

  action_authenticate(response: http.ServerResponse, msg: string) {
    response.writeHead(401, {
      'WWW-Authenticate': `Basic realm="${msg}"`
    }).end();
  }

  /**
   * HTTP support
   */
  async handlerHttp(request: http.IncomingMessage, response: http.ServerResponse) {
    if (!this.security_filter(request, response)) {
      response.end();
      return;
    }
    const {hostname, port} = parse(request.url || '');
    
    let info: QueryInfo = {
      domain: hostname || '',
      port: Number(port),
      ip: request.connection.remoteAddress,
    }

    if (this.proxyConfig.allow) {
      const rejection = await this.proxyConfig.allow(info);
      if (rejection) {
        action_deny(response, rejection.message);
        security_log(request, response, rejection.message);
        return;
      }
    }

    //loop filter
    let loopError = this.prevent_loop(request, response);
    if (loopError) { console.error(loopError); return; }

    //get authorization token
    let authorization: AuthData = this.authenticate(request);

    // calc new host info
    let action: HostAction = this.handle_proxy_route(request.headers.host as string, authorization);

    if (this.proxyConfig.allow) {
      const rejection = await this.proxyConfig.allow(info);
      if (rejection) {
        action_deny(response, rejection.message);
        security_log(request, response, rejection.message);
        return;
      }
    }

    //handle action
    if (action.action == "redirect") {
      this.action_redirect(response, action);
    } else if (action.action == "proxyto") {
      this.action_proxy(request, response, action);
    } else if (action.action == "authenticate") {
      this.action_authenticate(response, 'realm');
    }
  }
  /**
   * HTTPs support
   */
  async handlerHttps(request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) { // listen only for HTTP/1.1 CONNECT method
    console.log(clientSocket.remoteAddress, clientSocket.remotePort, request.method, request.url)
    /*
    if (!req.headers['proxy-authorization']) { // here you can add check for any username/password, I just check that this header must exist!
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="proxy"\r\nProxy-Connection: close')
      clientSocket.end('\r\n\r\n')  // empty body
      return
    }*/
    //decode_host
    const { hostname, port } = decodeHttpsHost(request.url);
    if (!hostname || !port) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n')
      clientSocket.destroy()
      return;
    }
    
    const query: QueryInfo = { domain: hostname, port, ip: request.connection.remoteAddress };

    if (this.proxyConfig.allow) {
      const rejection = await this.proxyConfig.allow(query);
      if (rejection) {
        this.proxyConfig.emit('block', query);
        clientSocket.destroy()
        return;
      }
    }
    let serverSocket: net.Socket | null = net.connect(Number(port), hostname) // connect to destination host and port
    const end = (log?: string) => {
      if (serverSocket) {
        if (log)
          console.error(log)
        serverSocket.end()
        serverSocket = null;
      }
    }
    clientSocket.on('error', (err: Error) => end(`HTTPS connecting ${hostname} failed with error:${err.message}`))
    clientSocket.on('end', () => end())
    serverSocket.on('error', (err: Error) => end(err.message))
    serverSocket.on('end', () => end())
    serverSocket.on('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-agent: Node-Proxy')
      clientSocket.write('\r\n\r\n') // empty body
      this.proxyConfig.emit('pass', query);

      // "blindly" (for performance) pipe client socket and destination socket between each other
      if (serverSocket) {
        serverSocket.pipe(clientSocket) // , {end: false}
        clientSocket.pipe(serverSocket) // , {end: false}
      }
    })
  }

  startServer() {
    const server = http.createServer((request: http.IncomingMessage, response: http.ServerResponse) => this.handlerHttp(request, response))
      .listen(this.proxyConfig.listen as net.ListenOptions, () => {
        console.log('Server is listening on address ', this.proxyConfig.listen)
      })
    /**
     * handle HTTPS
     * https://stackoverflow.com/questions/8165570/https-proxy-server-in-node-js
     */
    server.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => this.handlerHttps(req, clientSocket, head));
  }
}
