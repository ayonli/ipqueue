"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net = require("net");
const path = require("path");
const findProcess = require("find-process");
const startsWith = require("lodash/startsWith");
const endsWith = require("lodash/endsWith");
const server_1 = require("./server");
let script = process.mainModule.filename;
script = endsWith(script, ".js") ? script.slice(0, -3) : script;
script = endsWith(script, path.sep + "index") ? script.slice(0, -6) : script;
function getHostPid() {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let processes = yield findProcess("name", "node");
        for (let item of processes) {
            let pid = parseInt(item.pid), cmd = item.cmd.replace(/"/g, "");
            if (startsWith(cmd, process.execPath) && cmd.includes(script)) {
                return pid;
            }
        }
        return process.pid;
    });
}
function tryConnect(port) {
    return new Promise((resolve, reject) => {
        if (!port)
            return resolve(null);
        let conn = net.createConnection(port);
        conn.on("error", (err) => {
            if (err["code"] == "ECONNREFUSED") {
                resolve(null);
            }
            else {
                reject(err);
            }
        }).on("connect", () => {
            resolve(conn);
        });
    });
}
function retryConnect(resolve, reject, timeout, pid) {
    let conn, retries = 0, maxRetries = Math.ceil(timeout / 50), timer = setInterval(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
        retries++;
        conn = yield getConnection(timeout, pid);
        if (conn) {
            resolve(conn);
            clearInterval(timer);
        }
        else if (retries === maxRetries) {
            clearInterval(timer);
            let err = new Error("failed to get connection after "
                + Math.round(timeout / 1000) + " seconds of timeout");
            reject(err);
        }
    }), 50);
}
function getConnection(timeout = 5000, pid) {
    return new Promise((resolve, reject) => tslib_1.__awaiter(this, void 0, void 0, function* () {
        let conn;
        pid = pid || (yield getHostPid());
        if (process.connected) {
            conn = yield tryConnect(yield server_1.getPort(pid));
            if (!conn) {
                if (pid === process.pid) {
                    let server = yield server_1.createServer(timeout);
                    if (server) {
                        conn = yield tryConnect(server.address().port);
                    }
                }
            }
            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        }
        else {
            let server = yield server_1.createServer(timeout);
            if (server)
                conn = yield tryConnect(server.address().port);
            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        }
    }));
}
exports.getConnection = getConnection;
//# sourceMappingURL=connection.js.map