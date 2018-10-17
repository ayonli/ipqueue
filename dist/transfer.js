"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function send(event, ...data) {
    return Buffer.from(JSON.stringify([event, ...data]) + "\r\n\r\n");
}
exports.send = send;
function receive(buf) {
    let pack = buf.toString().split("\r\n\r\n"), parts = [];
    for (let part of pack) {
        if (part)
            parts.push(JSON.parse(part));
    }
    return parts;
}
exports.receive = receive;
//# sourceMappingURL=transfer.js.map