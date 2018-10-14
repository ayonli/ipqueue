"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function send(event, data) {
    return Buffer.from(JSON.stringify([event, data]) + "\r\n\r\n");
}
exports.send = send;
function receive(buf) {
    var pack = buf.toString().split("\r\n\r\n"), parts = [];
    for (var _i = 0, pack_1 = pack; _i < pack_1.length; _i++) {
        var part = pack_1[_i];
        if (part)
            parts.push(JSON.parse(part));
    }
    return parts;
}
exports.receive = receive;
//# sourceMappingURL=transfer.js.map