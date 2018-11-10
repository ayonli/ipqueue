"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const uuid = require("uuid/v4");
const first = require("lodash/first");
const isSocketResetError = require("is-socket-reset-error");
const open_channel_1 = require("open-channel");
const transfer_1 = require("./transfer");
const Tasks = {
    current: void 0,
    queue: [],
    timer: null
};
class Queue {
    constructor(name, timeout) {
        this.name = name;
        this.timeout = timeout;
        this.tasks = {};
        this.channel = open_channel_1.openChannel(this.name, socket => {
            socket.on("data", (buf) => {
                for (let [event, id, extra] of transfer_1.receive(buf)) {
                    socket.emit(event, id, extra);
                }
            }).on("acquire", (id) => {
                if (!Tasks.queue.length) {
                    Tasks.current = id;
                    socket.write(transfer_1.send("acquired", id), () => {
                        Tasks.timer = setTimeout(() => {
                            socket.emit("release");
                        }, this.timeout);
                    });
                }
                if (!socket.destroyed)
                    Tasks.queue.push({ id, socket });
            }).on("release", () => {
                Tasks.queue.shift();
                clearTimeout(Tasks.timer);
                let item = first(Tasks.queue);
                if (item) {
                    Tasks.current = item.id;
                    if (!item.socket.destroyed) {
                        item.socket.write(transfer_1.send("acquired", item.id), () => {
                            Tasks.timer = setTimeout(() => {
                                item.socket.emit("release");
                            }, this.timeout);
                        });
                    }
                    else {
                        socket.emit("release");
                    }
                }
            }).on("getLength", (id) => {
                let length = Tasks.queue.length;
                socket.write(transfer_1.send("gotLength", id, length && length - 1));
            }).on("error", (err) => {
                if (isSocketResetError(err)) {
                    try {
                        socket.destroy();
                        socket.unref();
                    }
                    finally { }
                }
            });
        });
        this.socket = this.channel.connect().on("data", buf => {
            for (let [event, id, extra] of transfer_1.receive(buf)) {
                this.tasks[id].emit(event, id, extra);
            }
        });
    }
    get connected() {
        return this.channel.connect;
    }
    disconnect() {
        this.socket.destroyed || this.socket.destroy();
    }
    onError(handler) {
        this.errorHandler = handler;
        this.socket.on("error", handler);
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
        return this.socket.write(transfer_1.send(event, id));
    }
}
exports.Queue = Queue;
function connect(...args) {
    var name, timeout;
    if (!args.length || typeof args[0] == "number") {
        name = "ipqueue";
        timeout = args[0] || 5000;
    }
    else {
        name = args[0];
        timeout = args[1] || 5000;
    }
    return new Queue(name, timeout);
}
exports.connect = connect;
exports.default = connect;
//# sourceMappingURL=index.js.map