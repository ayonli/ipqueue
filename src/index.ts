import * as net from "net";
import { EventEmitter } from "events";
import first = require("lodash/first");
import isSocketResetError = require("is-socket-reset-error");
import { openChannel } from "open-channel";
import { send, receive } from './transfer';

var taskId = 0;
type Task = { id: number, socket: net.Socket };
const Tasks: {
    current: Task["id"];
    queue: Task[];
    timer?: NodeJS.Timer;
} = {
    current: void 0,
    queue: [],
    timer: null
};
enum QueueEvents {
    acquire,
    acquired,
    release,
    getLength,
    gotLength
}

function getTaskId() {
    let id = taskId++;
    if (taskId === Number.MAX_SAFE_INTEGER) taskId = 0;
    return id;
}

export class Queue {
    private errorHandler: (err: Error) => void;
    private tasks: { [id: number]: EventEmitter } = {};
    private channel = openChannel(this.name, socket => {
        socket.on("data", (buf) => {
            for (let [code, id, extra] of receive(buf)) {
                socket.emit(QueueEvents[code], id, extra);
            }
        }).on(QueueEvents[0], (id: number) => {
            if (!Tasks.queue.length) {
                // if the queue is empty, run the task immediately
                Tasks.current = id;
                socket.write(send(QueueEvents.acquired, id), () => {
                    // set a timer to force release when timeout.
                    Tasks.timer = setTimeout(() => {
                        socket.emit(QueueEvents[2]);
                    }, this.timeout);
                });
            }

            if (!socket.destroyed)
                Tasks.queue.push({ id, socket }); // push task into the queue
        }).on(QueueEvents[2], () => {
            Tasks.queue.shift(); // remove the running task
            clearTimeout(Tasks.timer);

            // run the next task
            let item = first(Tasks.queue);
            if (item) {
                Tasks.current = item.id;

                if (!item.socket.destroyed) {
                    item.socket.write(send(QueueEvents.acquired, item.id), () => {
                        Tasks.timer = setTimeout(() => {
                            item.socket.emit(QueueEvents[2]);
                        }, this.timeout);
                    });
                } else {
                    // if the socket is destroyed whether normally or 
                    // abnormally before responding acquired queue lock,
                    // release it immediately.
                    socket.emit(QueueEvents[2]);
                }
            }
        }).on(QueueEvents[3], (id: string) => {
            let length = Tasks.queue.length;
            socket.write(send(QueueEvents.gotLength, id, length && length - 1));
        }).on("error", (err) => {
            if (isSocketResetError(err)) {
                try {
                    socket.destroy();
                    socket.unref();
                } finally { }
            }
        });
    });
    private socket = this.channel.connect().on("data", buf => {
        for (let [code, id, extra] of receive(buf)) {
            this.tasks[id].emit(QueueEvents[code], id, extra);
        }
    });

    constructor(public name: string, private timeout: number) { }

    /**
     * Returns `true` if the queue is connected to the server, `false` the
     * otherwise.
     */
    get connected() {
        return this.channel.connect;
    }

    /** Closes connection to the queue server. */
    disconnect() {
        this.socket.destroyed || this.socket.destroy();
    }

    /** Binds an error handler to catch errors whenever occurred. */
    onError(handler: (err: Error) => void) {
        this.errorHandler = handler;
        this.socket.on("error", handler);
        return this;
    }

    /**
     * Pushes a task into the queue. The program will send a request to the 
     * server acquiring for a lock, and wait until the lock has been acquired, 
     * run the task automatically.
     */
    push(task: (next: () => void) => void) {
        let id = getTaskId(),
            next = () => this.send(QueueEvents.release, id);

        this.tasks[id] = new EventEmitter();
        this.tasks[id].once(QueueEvents[1], () => {
            try {
                delete this.tasks[id];
                task(next);
            } catch (err) {
                if (this.errorHandler)
                    this.errorHandler(err);
            }
        });
        this.send(QueueEvents.acquire, id);

        return this;
    }

    /** Gets the length of remaining tasks in the queue. */
    getLength(): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                return resolve(0);

            let id = getTaskId(),
                timer = setTimeout(() => {
                    reject(new Error("failed to get queue length"));
                }, this.timeout);

            this.tasks[id] = new EventEmitter();
            this.tasks[id].once(QueueEvents[4], (id: number, length: number) => {
                clearTimeout(timer);
                try {
                    delete this.tasks[id];
                    resolve(length);
                } catch (err) {
                    reject(err);
                }
            });
            this.send(QueueEvents.getLength, id);
        });
    }

    private send(event: number, id?: number) {
        this.socket.write(send(event, id));
    }
}

/**
 * Opens connection to the queue server and returns a client instance.
 * @param timeout Sets both connection timeout and max lock time, meaning if you 
 * don't call `next()` in a task (or the process fails to call it, i.e. exited 
 * unexpected), the next task will be run anyway when timeout. The default value
 * is `5000` ms.
 */
export function connect(timeout?: number): Queue
/**
 * @param name A unique name to distinguish potential queues on the same 
 *  machine. 
 */
export function connect(name: string, timeout?: number): Queue;
export function connect(...args): Queue {
    var name: string, timeout: number;
    if (!args.length || typeof args[0] == "number") {
        name = "ipqueue";
        timeout = args[0] || 5000;
    } else {
        name = args[0];
        timeout = args[1] || 5000;
    }
    return new Queue(name, timeout);
}

export default connect;