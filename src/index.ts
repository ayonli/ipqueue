import * as net from "net";
import { EventEmitter } from "events";
import uuid = require("uuid/v4");
import first = require("lodash/first");
import isSocketResetError = require("is-socket-reset-error");
import { openChannel } from "open-channel";
import { send, receive } from './transfer';

namespace CPQueue {
    type Task = { id: string, socket: net.Socket };
    const Queue: {
        current: Task["id"];
        tasks: Task[];
        timmer?: NodeJS.Timer;
    } = {
        current: void 0,
        tasks: [],
        timmer: null
    };

    /**
     * Opens connection to a cross-process queue server and returns a client 
     * instance.
     * @param name A unique name to distinguish potential queues on the same 
     *  machine.
     * @param timeout If a client has acquired a lock, and it did not release it
     *  after timeout, the queue server will force to run the next task. The 
     *  default value is `5000` ms.
     */
    export function connect(timeout?: number): Client
    export function connect(name: string, timeout?: number): Client;
    export function connect(...args): Client {
        var name: string, timeout: number;
        if (!args.length || typeof args[0] == "number") {
            name = "cp-queue";
            timeout = args[0] || 5000;
        } else {
            name = args[0];
            timeout = args[1] || 5000;
        }
        return new Client(name, timeout);
    }

    export class Client {
        private errorHandler: (err: Error) => void;
        private tasks: { [id: string]: EventEmitter } = {};
        private channel = openChannel(this.name, socket => {
            socket.on("data", (buf) => {
                for (let [event, id, extra] of receive(buf)) {
                    socket.emit(event, id, extra);
                }
            }).on("acquire", (id: string) => {
                if (!Queue.tasks.length) {
                    // if the queue is empty, run the task immediately
                    Queue.current = id;
                    socket.write(send("acquired", id), () => {
                        // set a timer to force release when timeout.
                        Queue.timmer = setTimeout(() => {
                            socket.emit("release");
                        }, this.timeout);
                    });
                }

                if (!socket.destroyed)
                    Queue.tasks.push({ id, socket }); // push task in the queue
            }).on("release", () => {
                Queue.tasks.shift(); // remove the running task
                clearTimeout(Queue.timmer);

                // run the next task
                let item = first(Queue.tasks);
                if (item) {
                    Queue.current = item.id;

                    if (!item.socket.destroyed) {
                        item.socket.write(send("acquired", item.id), () => {
                            Queue.timmer = setTimeout(() => {
                                item.socket.emit("release");
                            }, this.timeout);
                        });
                    } else {
                        // if the socket is destroyed whether normally or 
                        // abnormally before responding acquired queue lock,
                        // release it immediately.
                        socket.emit("release");
                    }
                }
            }).on("getLength", (id: string) => {
                let length = Queue.tasks.length;
                socket.write(send("gotLength", id, length && length - 1));
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
            for (let [event, id, extra] of receive(buf)) {
                this.tasks[id].emit(event, id, extra);
            }
        });

        constructor(public name: string, private timeout: number) { }

        /**
         * Returns `true` if the queue is connected to the server, `false` 
         * otherwise.
         */
        get connected() {
            return this.channel.connect;
        }

        /** Closes connection to the queue server. */
        disconnect() {
            this.socket.destroyed || this.socket.destroy();
        }

        /** Binds an error handler to run whenever the error occurred. */
        onError(handler: (err: Error) => void) {
            this.errorHandler = handler;
            this.socket.on("error", handler);
            return this;
        }

        /**
         * Pushes a task into the queue, the program will send a request to the 
         * queue server for acquiring a lock, and wait until the lock has been 
         * acquired, run the task automatically.
         */
        push(task: (next: () => void) => void) {
            let id = uuid(),
                next = () => {
                    this.send("release", id);
                };

            this.tasks[id] = new EventEmitter();
            this.tasks[id].once("acquired", () => {
                try {
                    delete this.tasks[id];
                    task(next);
                } catch (err) {
                    if (this.errorHandler)
                        this.errorHandler(err);
                }
            });
            this.send("acquire", id);

            return this;
        }

        /** Gets the queue length in the queue server. */
        getLength(): Promise<number> {
            return new Promise((resolve, reject) => {
                if (!this.connected)
                    return resolve(0);

                let id = uuid(),
                    timer = setTimeout(() => {
                        reject(new Error("failed to get queue length"));
                    }, this.timeout);

                this.tasks[id] = new EventEmitter();
                this.tasks[id].once("gotLength", (id: string, length: number) => {
                    clearTimeout(timer);
                    try {
                        delete this.tasks[id];
                        resolve(length);
                    } catch (err) {
                        reject(err);
                    }
                });
                this.send("getLength", id);
            });
        }

        private send(event: string, id?: string) {
            return this.socket.write(send(event, id));
        }
    }
}

export = CPQueue;