"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net = require("net");
var os = require("os");
var fs = require("fs-extra");
var first = require("lodash/first");
var transfer_1 = require("./transfer");
var Queues = {};
function createServer(pid, timeout) {
    if (timeout === void 0) { timeout = 5000; }
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var server;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    server = net.createServer(function (socket) {
                        var port = server.address().port;
                        socket.on("data", function (buf) {
                            for (var _i = 0, _a = transfer_1.receive(buf); _i < _a.length; _i++) {
                                var _b = _a[_i], event = _b[0], id = _b[1], extra = _b[2];
                                socket.emit(event, id, extra);
                            }
                        }).on("acquire", function (id) {
                            var queue = Queues[port];
                            if (!queue)
                                queue = Queues[port] = { current: void 0, tasks: [] };
                            if (!queue.tasks.length) {
                                queue.current = id;
                                !socket.destroyed && socket.write(transfer_1.send("acquired", id), function () {
                                    queue.timmer = setTimeout(function () {
                                        socket.emit("release");
                                    }, timeout);
                                });
                            }
                            if (!socket.destroyed)
                                queue.tasks.push({ id: id, socket: socket });
                        }).on("release", function () {
                            var queue = Queues[port];
                            queue.tasks.shift();
                            clearTimeout(queue.timmer);
                            var item = first(queue.tasks);
                            if (item) {
                                queue.current = item.id;
                                if (!item.socket.destroyed) {
                                    item.socket.write(transfer_1.send("acquired", item.id), function () {
                                        queue.timmer = setTimeout(function () {
                                            item.socket.emit("release");
                                        }, timeout);
                                    });
                                }
                                else {
                                    socket.emit("release");
                                }
                            }
                        }).on("closesServer", function () {
                            server.close();
                        }).on("getLength", function (id) {
                            var length = Queues[port].tasks.length;
                            !socket.destroyed && socket.write(transfer_1.send("gotLength", id, length && length - 1));
                        }).on("error", function (err) {
                            if (err.message.indexOf("socket has been ended") >= 0) {
                                try {
                                    socket.destroy();
                                    socket.unref();
                                }
                                catch (err) { }
                            }
                        });
                    });
                    return [4, new Promise(function (resolve, reject) {
                            server.once("error", function (err) {
                                server.close();
                                server.unref();
                                if (err["code"] == "EADDRINUSE") {
                                    reject(err);
                                }
                                else {
                                    resolve(null);
                                }
                            }).listen(function () {
                                resolve(null);
                            });
                        })];
                case 1:
                    _a.sent();
                    return [4, setPort(pid, server.address().port)];
                case 2:
                    _a.sent();
                    return [2, server];
            }
        });
    });
}
exports.createServer = createServer;
function setPort(pid, port) {
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var dir, file;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dir = os.tmpdir() + "/.cp-queue", file = dir + "/" + pid;
                    return [4, fs.ensureDir(dir)];
                case 1:
                    _a.sent();
                    return [4, fs.writeFile(file, port, "utf8")];
                case 2:
                    _a.sent();
                    return [2];
            }
        });
    });
}
exports.setPort = setPort;
function getPort(pid) {
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var file, data, err_1;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    file = os.tmpdir() + "/.cp-queue/" + pid;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, fs.readFile(file, "utf8")];
                case 2:
                    data = _a.sent();
                    return [2, parseInt(data) || 0];
                case 3:
                    err_1 = _a.sent();
                    return [2, 0];
                case 4: return [2];
            }
        });
    });
}
exports.getPort = getPort;
//# sourceMappingURL=server.js.map