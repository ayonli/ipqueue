"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const first = require("lodash/first");
const open_channel_1 = require("open-channel");
const bsp_1 = require("bsp");
var taskId = 0;
const Tasks = {
    current: void 0,
    queue: [],
    timer: null
};
var QueueEvents;
(function (QueueEvents) {
    QueueEvents[QueueEvents["acquire"] = 0] = "acquire";
    QueueEvents[QueueEvents["acquired"] = 1] = "acquired";
    QueueEvents[QueueEvents["release"] = 2] = "release";
    QueueEvents[QueueEvents["getLength"] = 3] = "getLength";
    QueueEvents[QueueEvents["gotLength"] = 4] = "gotLength";
})(QueueEvents || (QueueEvents = {}));
function getTaskId() {
    let id = taskId++;
    if (taskId === Number.MAX_SAFE_INTEGER)
        taskId = 0;
    return id;
}
class Queue {
    constructor(name, timeout) {
        this.name = name;
        this.timeout = timeout;
        this.tasks = {};
        this.temp = [];
        this.channel = open_channel_1.openChannel(this.name, socket => {
            let temp = [];
            socket.on("data", (buf) => {
                let msg = bsp_1.receive(buf, temp);
                for (let [code, id, extra] of msg) {
                    socket.emit(QueueEvents[code], id, extra);
                }
            }).on(QueueEvents[0], (id) => {
                Tasks.queue.length || this.respond(socket, id, true);
                socket.destroyed || Tasks.queue.push({ id, socket });
            }).on(QueueEvents[2], () => {
                Tasks.queue.shift();
                clearTimeout(Tasks.timer);
                let item = first(Tasks.queue);
                item && this.respond(item.socket, item.id);
            }).on(QueueEvents[3], (id) => {
                let length = Tasks.queue.length;
                socket.write(bsp_1.send(QueueEvents.gotLength, id, length && length - 1));
            }).on("end", socket.destroy).on("close", socket.unref);
        });
        this.socket = this.channel.connect().on("data", buf => {
            let msg = bsp_1.receive(buf, this.temp);
            for (let [code, id, extra] of msg) {
                this.tasks[id].emit(QueueEvents[code], id, extra);
            }
        });
    }
    get connected() {
        return this.channel.connected;
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
        let id = getTaskId(), next = () => this.send(QueueEvents.release, id);
        this.tasks[id] = new events_1.EventEmitter();
        this.tasks[id].once(QueueEvents[1], () => {
            try {
                delete this.tasks[id];
                task(next);
            }
            catch (err) {
                if (this.errorHandler)
                    this.errorHandler(err);
            }
        });
        this.send(QueueEvents.acquire, id);
        return this;
    }
    getLength() {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                return resolve(0);
            let id = getTaskId(), timer = setTimeout(() => {
                reject(new Error("failed to get queue length"));
            }, this.timeout);
            this.tasks[id] = new events_1.EventEmitter();
            this.tasks[id].once(QueueEvents[4], (id, length) => {
                clearTimeout(timer);
                try {
                    delete this.tasks[id];
                    resolve(length);
                }
                catch (err) {
                    reject(err);
                }
            });
            this.send(QueueEvents.getLength, id);
        });
    }
    setTimeout(timeout) {
        this.timeout = timeout;
    }
    send(event, id) {
        this.socket.write(bsp_1.send(event, id));
    }
    respond(socket, id, immediate = false) {
        Tasks.current = id;
        if (!socket.destroyed) {
            return socket.write(bsp_1.send(QueueEvents.acquired, id), () => {
                Tasks.timer = setTimeout(() => {
                    socket.emit(QueueEvents[2]);
                }, this.timeout);
            });
        }
        else if (!immediate) {
            return socket.emit(QueueEvents[2]);
        }
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