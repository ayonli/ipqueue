"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var net = require("net");
var path = require("path");
var findProcess = require("find-process");
var startsWith = require("lodash/startsWith");
var endsWith = require("lodash/endsWith");
var includes = require("lodash/includes");
var trimStart = require("lodash/trimStart");
var server_1 = require("./server");
var script = process.mainModule.filename;
script = endsWith(script, ".js") ? script.slice(0, -3) : script;
script = endsWith(script, path.sep + "index") ? script.slice(0, -6) : script;
function getHostPid() {
    return tslib_1.__awaiter(this, void 0, void 0, function () {
        var processes, _i, processes_1, item, pid, cmd;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, findProcess("name", "node")];
                case 1:
                    processes = _a.sent();
                    for (_i = 0, processes_1 = processes; _i < processes_1.length; _i++) {
                        item = processes_1[_i];
                        pid = parseInt(item.pid), cmd = trimStart(item.cmd, '"');
                        if (startsWith(cmd, process.execPath) && includes(cmd, script)) {
                            return [2, pid];
                        }
                    }
                    return [2, process.pid];
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
function retryConnect(resolve, reject, timeout, pid) {
    var _this = this;
    var conn, retries = 0, maxRetries = Math.ceil(timeout / 50), timer = setInterval(function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
        var err;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    retries++;
                    return [4, getConnection(timeout, pid)];
                case 1:
                    conn = _a.sent();
                    if (conn) {
                        resolve(conn);
                        clearInterval(timer);
                    }
                    else if (retries === maxRetries) {
                        clearInterval(timer);
                        err = new Error("failed to get connection after "
                            + Math.round(timeout / 1000) + " seconds timeout");
                        reject(err);
                    }
                    return [2];
            }
        });
    }); }, 50);
}
function getConnection(timeout, pid) {
    var _this = this;
    if (timeout === void 0) { timeout = 5000; }
    return new Promise(function (resolve, reject) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
        var conn, _a, _b, server, server;
        return tslib_1.__generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = pid;
                    if (_a) return [3, 2];
                    return [4, getHostPid()];
                case 1:
                    _a = (_c.sent());
                    _c.label = 2;
                case 2:
                    pid = _a;
                    if (!process.connected) return [3, 8];
                    _b = tryConnect;
                    return [4, server_1.getPort(pid)];
                case 3: return [4, _b.apply(void 0, [_c.sent()])];
                case 4:
                    conn = _c.sent();
                    if (!!conn) return [3, 7];
                    if (!(pid === process.pid)) return [3, 7];
                    return [4, server_1.createServer(pid, timeout)];
                case 5:
                    server = _c.sent();
                    if (!server) return [3, 7];
                    return [4, tryConnect(server.address().port)];
                case 6:
                    conn = _c.sent();
                    _c.label = 7;
                case 7:
                    conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
                    return [3, 12];
                case 8: return [4, server_1.createServer(pid, timeout)];
                case 9:
                    server = _c.sent();
                    if (!server) return [3, 11];
                    return [4, tryConnect(server.address().port)];
                case 10:
                    conn = _c.sent();
                    _c.label = 11;
                case 11:
                    conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
                    _c.label = 12;
                case 12: return [2];
            }
        });
    }); });
}
exports.getConnection = getConnection;
//# sourceMappingURL=connection.js.map