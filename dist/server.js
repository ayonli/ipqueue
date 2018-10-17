"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net = require("net");
const os = require("os");
const fs = require("fs-extra");
const first = require("lodash/first");
const transfer_1 = require("./transfer");
const isWin32 = process.platform == "win32";
const Queue = {
    current: void 0,
    tasks: [],
    timmer: null
};
function createServer(pid, timeout = 5000) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let server = net.createServer(socket => {
            socket.on("data", (buf) => {
                for (let [event, id, extra] of transfer_1.receive(buf)) {
                    socket.emit(event, id, extra);
                }
            }).on("acquire", (id) => {
                if (!Queue.tasks.length) {
                    Queue.current = id;
                    !socket.destroyed && socket.write(transfer_1.send("acquired", id), () => {
                        Queue.timmer = setTimeout(() => {
                            socket.emit("release");
                        }, timeout);
                    });
                }
                if (!socket.destroyed)
                    Queue.tasks.push({ id, socket });
            }).on("release", () => {
                Queue.tasks.shift();
                clearTimeout(Queue.timmer);
                let item = first(Queue.tasks);
                if (item) {
                    Queue.current = item.id;
                    if (!item.socket.destroyed) {
                        item.socket.write(transfer_1.send("acquired", item.id), () => {
                            Queue.timmer = setTimeout(() => {
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
                let length = Queue.tasks.length;
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
            });
            if (isWin32) {
                server.listen(() => {
                    resolve(null);
                });
            }
            else {
                getSocketAddr(pid).then(path => {
                    server.listen(path, () => {
                        resolve(null);
                    });
                });
            }
        });
        if (isWin32) {
            yield setPort(pid, server.address().port);
        }
        return server;
    });
}
exports.createServer = createServer;
function setPort(pid, port) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let dir = os.tmpdir() + "/.cp-queue", file = dir + "/" + pid;
        yield fs.ensureDir(dir);
        yield fs.writeFile(file, port, "utf8");
    });
}
function getSocketAddr(pid) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let dir = os.tmpdir() + "/.cp-queue", file = dir + "/" + pid;
        if (!isWin32) {
            yield fs.ensureDir(dir);
            return file;
        }
        try {
            let data = yield fs.readFile(file, "utf8");
            return parseInt(data) || 0;
        }
        catch (err) {
            return 0;
        }
    });
}
exports.getSocketAddr = getSocketAddr;
//# sourceMappingURL=server.js.map