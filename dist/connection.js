"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const net = require("net");
const server_1 = require("./server");
const first_officer_1 = require("first-officer");
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
        pid = pid || (yield first_officer_1.getPid());
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