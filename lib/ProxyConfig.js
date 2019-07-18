"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
class ProxyConfig extends events_1.EventEmitter {
    constructor(base) {
        super();
        this.listen = base.listen;
        this.allow = base.allow;
    }
}
exports.ProxyConfig = ProxyConfig;
//# sourceMappingURL=ProxyConfig.js.map