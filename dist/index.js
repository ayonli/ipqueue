"use strict";
const tslib_1 = require("tslib");
const events_1 = require("events");
const uuid = require("uuid/v4");
const connection_1 = require("./connection");
const transfer_1 = require("./transfer");
const server_1 = require("./server");
var CPQueue;
(function (CPQueue) {
    function connect(...args) {
        let queue = new Client();
        return queue.connect.apply(queue, args);
    }
    CPQueue.connect = connect;
    class Client {
        constructor() {
            this.tasks = {};
            this.waitingMessages = [];
        }
        get connected() {
            return !!this.connection && !this.connection.destroyed;
        }
        connect() {
            let handler;
            if (typeof arguments[0] == "function") {
                this.timeout = 5000;
                handler = arguments[0];
            }
            else {
                this.timeout = arguments[0] || 5000;
                handler = arguments[1];
            }
            let createConnection = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                this.disconnect();
                this.connection = yield connection_1.getConnection(this.timeout);
                this.connection.on("data", buf => {
                    for (let [event, id, extra] of transfer_1.receive(buf)) {
                        this.tasks[id].emit(event, id, extra);
                    }
                }).on("error", (err) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    if (err["code"] == "ECONNREFUSED" || server_1.isSocketResetError(err)) {
                        try {
                            if (Object.keys(this.tasks).length) {
                                yield this.connect(this.timeout);
                                if (this.lastMessage)
                                    this.send(this.lastMessage[0], this.lastMessage[1]);
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
                if (this.waitingMessages.length) {
                    let item;
                    while (item = this.waitingMessages.shift()) {
                        this.send(item[0], item[1]);
                    }
                }
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
            this.connected && this.connection.destroy();
        }
        closeServer() {
            this.send("closeServer");
        }
        onError(handler) {
            this.errorHandler = handler;
            if (this.connection)
                this.connection.on("error", handler);
            return this;
        }
        push(task) {
            let id = uuid(), next = () => {
                this.send("release", id);
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
            this.send("acquire", id);
            return this;
        }
        getLength() {
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
                this.send("getLength", id);
            });
        }
        send(event, id) {
            if (!this.connected) {
                this.waitingMessages.push([event, id]);
            }
            else {
                this.lastMessage = [event, id];
                this.connection.write(transfer_1.send(event, id), () => {
                    this.lastMessage = null;
                });
            }
        }
    }
    CPQueue.Client = Client;
})(CPQueue || (CPQueue = {}));
module.exports = CPQueue;
//# sourceMappingURL=index.js.map