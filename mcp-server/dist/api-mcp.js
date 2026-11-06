"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const server_js_1 = require("./server.js");
async function handler(req, res) {
    if ((0, server_js_1.applyCorsHeaders)(req, res)) {
        return;
    }
    return (0, server_js_1.handleMcpRequest)(req, res);
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = handler;
    module.exports.default = handler;
}
