import { ProxyConfig } from "../src/ProxyConfig";
import { HttpProxy } from "../src/HttpProxy";

let conf = new ProxyConfig({
    XForwardedFor: true,
    listen: { host: '0.0.0.0', port: 8005, ipv6Only: false, backlog: 511 },
    // allowDomain: async (dom) => !!~dom.indexOf('com')
  })
  
  new HttpProxy(conf).startServer();
  
  