"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net = require("net");
const path = require("path");
const startsWith = require("lodash/startsWith");
const endsWith = require("lodash/endsWith");
const trimStart = require("lodash/trimStart");
const server_1 = require("./server");
const findProcess = require("find-process");
let script = process.mainModule.filename;
script = endsWith(script, ".js") ? script.slice(0, -3) : script;
script = endsWith(script, path.sep + "index") ? script.slice(0, -6) : script;
function getHostPid() {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        let processes = yield findProcess("name", "node", true);
        for (let item of processes) {
            let cmd = trimStart(item.cmd, '"');
            if (startsWith(cmd, process.execPath) && cmd.includes(script)) {
                return item.pid;
            }
        }
        return process.pid;
    });
}
function tryConnect(addr) {
    return new Promise((resolve, reject) => {
        if (!addr)
            return resolve(null);
        let conn = net.createConnection(addr);
        conn.on("error", (err) => {
            if (err["code"] == "ECONNREFUSED" || err["code"] == "ENOENT") {
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
                + Math.round(timeout / 1000) + " seconds timeout");
            reject(err);
        }
    }), 50);
}
function tryServe(pid, addr, timeout) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        try {
            let server = yield server_1.createServer(pid, timeout);
            if (server) {
                let _addr = server.address();
                addr = typeof _addr == "object" ? _addr.port : _addr;
                return tryConnect(addr);
            }
        }
        catch (err) {
            if (err["code"] == "EADDRINUSE")
                return tryConnect(addr);
            else
                throw err;
        }
    });
}
function getConnection(timeout = 5000, pid) {
    return new Promise((resolve, reject) => tslib_1.__awaiter(this, void 0, void 0, function* () {
        pid = pid || (yield getHostPid());
        let addr = yield server_1.getSocketAddr(pid), conn;
        if (process.connected) {
            conn = yield tryConnect(addr);
            if (!conn && pid === process.pid)
                conn = yield tryServe(pid, addr, timeout);
            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        }
        else {
            conn = yield tryServe(pid, addr, timeout);
            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        }
    }));
}
exports.getConnection = getConnection;
//# sourceMappingURL=connection.js.map