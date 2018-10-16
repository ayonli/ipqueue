"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net = require("net");
const first = require("lodash/first");
const netstat = require("node-netstat");
const transfer_1 = require("./transfer");
const Queues = {};
function createServer(timeout = 5000) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let server = net.createServer(socket => {
            let port = server.address().port;
            socket.on("data", (buf) => {
                for (let [event, id, extra] of transfer_1.receive(buf)) {
                    socket.emit(event, id, extra);
                }
            }).on("acquire", (id) => {
                let queue = Queues[port];
                if (!queue)
                    queue = Queues[port] = { current: void 0, tasks: [] };
                if (!queue.tasks.length) {
                    queue.current = id;
                    !socket.destroyed && socket.write(transfer_1.send("acquired", id), () => {
                        queue.timmer = setTimeout(() => {
                            socket.emit("release");
                        }, timeout);
                    });
                }
                if (!socket.destroyed)
                    queue.tasks.push({ id, socket });
            }).on("release", () => {
                let queue = Queues[port];
                queue.tasks.shift();
                clearTimeout(queue.timmer);
                let item = first(queue.tasks);
                if (item) {
                    queue.current = item.id;
                    if (!item.socket.destroyed) {
                        item.socket.write(transfer_1.send("acquired", item.id), () => {
                            queue.timmer = setTimeout(() => {
                                item.socket.emit("release");
                            }, timeout);
                        });
                    }
                    else {
                        socket.emit("release");
                    }
                }
            }).on("closesServer", () => {
                server.close();
            }).on("getLength", (id) => {
                let length = Queues[port].tasks.length;
                !socket.destroyed && socket.write(transfer_1.send("gotLength", id, length && length - 1));
            }).on("error", (err) => {
                if (err.message.indexOf("socket has been ended") >= 0) {
                    try {
                        socket.destroy();
                        socket.unref();
                    }
                    catch (err) { }
                }
            });
        });
        yield new Promise((resolve, reject) => {
            server.once("error", (err) => {
                server.close();
                server.unref();
                if (err["code"] == "EADDRINUSE") {
                    reject(err);
                }
                else {
                    resolve(null);
                }
            }).listen(() => {
                resolve(null);
            });
        });
        return server;
    });
}
exports.createServer = createServer;
function getPort(pid) {
    return new Promise((resolve, reject) => {
        netstat({
            limit: 1,
            filter: { pid, protocol: "tcp6" },
            done: (err) => err ? reject(err) : resolve(0)
        }, item => resolve(item.local.port));
    });
}
exports.getPort = getPort;
//# sourceMappingURL=server.js.map