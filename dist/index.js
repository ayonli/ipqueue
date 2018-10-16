"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const events_1 = require("events");
const uuid = require("uuid/v4");
const connection_1 = require("./connection");
const transfer_1 = require("./transfer");
class CPQueue {
    constructor() {
        this.tasks = {};
    }
    connect(timeout, handler) {
        this.timeout = timeout || 5000;
        let createConnection = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.disconnect();
            this.connection = yield connection_1.getConnection(this.timeout);
            this.connection.on("data", buf => {
                for (let [event, id, extra] of transfer_1.receive(buf)) {
                    this.tasks[id].emit(event, id, extra);
                }
            }).on("error", (err) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                if (err["code"] == "ECONNREFUSED"
                    || err.message.indexOf("socket has been ended") >= 0) {
                    try {
                        if (this.length) {
                            yield this.connect(timeout);
                            if (this.lastMsg)
                                this.sendMsg(this.lastMsg[0], this.lastMsg[1]);
                        }
                    }
                    catch (err) {
                        if (this.errorHandler)
                            this.errorHandler(err);
                        else
                            throw err;
                    }
                }
                else {
                    if (this.errorHandler)
                        this.errorHandler(err);
                    else
                        throw err;
                }
            }));
            return this;
        });
        if (handler) {
            createConnection().then(() => {
                handler(null);
            }).catch(err => {
                handler(err);
            });
            return this;
        }
        else {
            return createConnection();
        }
    }
    disconnect() {
        this.connection && this.connection.destroy();
    }
    closeServer() {
        this.sendMsg("closeServer");
    }
    onError(handler) {
        this.errorHandler = handler;
        if (this.connection)
            this.connection.on("error", handler);
        return this;
    }
    push(task) {
        if (!this.connection) {
            throw new Error("cannot push task before the queue is connected");
        }
        else if (this.connection.destroyed) {
            throw new Error("cannot push task after the queue has disconnected");
        }
        let id = uuid(), next = () => {
            this.sendMsg("release", id);
        };
        this.tasks[id] = new events_1.EventEmitter();
        this.tasks[id].once("acquired", () => {
            try {
                delete this.tasks[id];
                task(next);
            }
            catch (err) {
                if (this.errorHandler)
                    this.errorHandler(err);
            }
        });
        this.sendMsg("acquire", id);
        return this;
    }
    get connected() {
        return !!this.connection && !this.connection.destroyed;
    }
    get length() {
        return Object.keys(this.tasks).length;
    }
    getRealLength() {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                return resolve(0);
            let id = uuid(), timer = setTimeout(() => {
                reject(new Error("failed to get queue length"));
            }, this.timeout);
            this.tasks[id] = new events_1.EventEmitter();
            this.tasks[id].once("gotLength", (id, length) => {
                clearTimeout(timer);
                try {
                    delete this.tasks[id];
                    resolve(length);
                }
                catch (err) {
                    reject(err);
                }
            });
            this.sendMsg("getLength", id);
        });
    }
    sendMsg(event, id) {
        this.lastMsg = [event, id];
        this.connection.write(transfer_1.send(event, id), () => {
            this.lastMsg = null;
        });
    }
}
exports.CPQueue = CPQueue;
exports.default = CPQueue;
//# sourceMappingURL=index.js.map