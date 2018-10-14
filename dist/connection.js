"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net = require("net");
var findProcess = require("find-process");
var endsWith = require("lodash/endsWith");
var server_1 = require("./server");
function getHostPid() {
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var script, processes, pids, _i, processes_1, item, pid;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    script = process.mainModule.filename;
                    return [4, findProcess("name", "node")];
                case 1:
                    processes = _a.sent(), pids = [];
                    script = endsWith(script, ".js") ? script.slice(0, -3) : script;
                    script = endsWith(script, "/index") ? script.slice(0, -6) : script;
                    for (_i = 0, processes_1 = processes; _i < processes_1.length; _i++) {
                        item = processes_1[_i];
                        pid = parseInt(item.pid);
                        if (item.name == "node" && item.cmd.lastIndexOf(script) >= 0) {
                            pids.push(pid);
                        }
                    }
                    return [2, pids.length ? pids[0] : process.pid];
            }
        });
    });
}
function tryConnect(port) {
    return new Promise(function (resolve, reject) {
        if (!port)
            return resolve(null);
        var conn = net.createConnection(port);
        conn.on("error", function (err) {
            if (err["code"] == "ECONNREFUSED") {
                resolve(null);
            }
            else {
                reject(err);
            }
        }).on("connect", function () {
            resolve(conn);
        });
    });
}
function retryConnect(resolve, reject, timeout) {
    var _this = this;
    var conn, retries = 0, maxRetries = Math.ceil(timeout / 10), timer = setInterval(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
        var err;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    retries++;
                    return [4, getConnection(timeout)];
                case 1:
                    conn = _a.sent();
                    if (conn) {
                        resolve(conn);
                        clearInterval(timer);
                    }
                    else if (retries === maxRetries) {
                        clearInterval(timer);
                        err = new Error("failed to get connection after "
                            + Math.round(timeout / 1000) + " seconds of timeout");
                        reject(err);
                    }
                    return [2];
            }
        });
    }); }, 10);
}
function getConnection(timeout) {
    var _this = this;
    if (timeout === void 0) { timeout = 5000; }
    return new Promise(function (resolve, reject) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
        var conn, pid, _a, server, server;
        return tslib_1.__generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4, getHostPid()];
                case 1:
                    pid = _b.sent();
                    if (!process.connected) return [3, 7];
                    _a = tryConnect;
                    return [4, server_1.getPort(pid)];
                case 2: return [4, _a.apply(void 0, [_b.sent()])];
                case 3:
                    conn = _b.sent();
                    if (!!conn) return [3, 6];
                    if (!(pid === process.pid)) return [3, 6];
                    return [4, server_1.createServer(pid, timeout)];
                case 4:
                    server = _b.sent();
                    if (!server) return [3, 6];
                    return [4, tryConnect(server.address().port)];
                case 5:
                    conn = _b.sent();
                    _b.label = 6;
                case 6:
                    conn ? resolve(conn) : retryConnect(resolve, reject, timeout);
                    return [3, 11];
                case 7: return [4, server_1.createServer(pid, timeout)];
                case 8:
                    server = _b.sent();
                    if (!server) return [3, 10];
                    return [4, tryConnect(server.address().port)];
                case 9:
                    conn = _b.sent();
                    _b.label = 10;
                case 10:
                    conn ? resolve(conn) : retryConnect(resolve, reject, timeout);
                    _b.label = 11;
                case 11: return [2];
            }
        });
    }); });
}
exports.getConnection = getConnection;
//# sourceMappingURL=connection.js.map