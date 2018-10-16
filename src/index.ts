import * as net from "net";
import { EventEmitter } from "events";
import uuid = require("uuid/v4");
import { getConnection } from "./connection";
import { send, receive } from './transfer';

export class CPQueue {
    private connection: net.Socket;
    private tasks: { [id: string]: EventEmitter } = {};
    private lastMsg: [string, string];
    private timeout: number;
    private errorHandler: (err: Error) => void;

    /**
     * Opens connection for the instance to a cross-process queue server, the 
     * server will be auto-started if it hasn't.
     * @param timeout If a client has acquired a lock, and it did not release it
     *  after timeout, the queue server will force to run the next task. The 
     *  default value is `5000` ms.
     */
    connect(timeout?: number): Promise<this>;
    connect(timeout: number, handler: (err: Error) => void): this;
    connect(timeout?: number, handler?: (err: Error) => void): this | Promise<this> {
        this.timeout = timeout || 5000;

        let createConnection = async () => {
            this.disconnect();
            this.connection = await getConnection(this.timeout);
            this.connection.on("data", buf => {
                for (let [event, id, extra] of receive(buf)) {
                    this.tasks[id].emit(event, id, extra);
                }
            }).on("error", async (err) => {
                if (err["code"] == "ECONNREFUSED"
                    || err.message.indexOf("socket has been ended") >= 0) {
                    // try to re-connect if the connection has lost and 
                    // re-send the message.
                    try {
                        if (this.length) {
                            await this.connect(timeout);
                            if (this.lastMsg)
                                this.sendMsg(this.lastMsg[0], this.lastMsg[1]);
                        }
                    } catch (err) {
                        if (this.errorHandler)
                            this.errorHandler(err);
                        else
                            throw err;
                    }
                } else {
                    if (this.errorHandler)
                        this.errorHandler(err);
                    else
                        throw err;
                }
            });

            return this;
        };

        if (handler) {
            // this.onError(handler);
            createConnection().then(() => {
                handler(null);
            }).catch(err => {
                handler(err);
            });

            return this;
        } else {
            return createConnection();
        }
    }

    /** Closes connection to the queue server. */
    disconnect() {
        this.connection && this.connection.destroy();
    }

    /** Closes the queue server. */
    closeServer() {
        this.sendMsg("closeServer");
    }


    /** Binds an error handler to run whenever the error occurred. */
    onError(handler: (err: Error) => void) {
        this.errorHandler = handler;
        if (this.connection)
            this.connection.on("error", handler);

        return this;
    }

    /**
     * Pushes a task into the queue, the program will send a request to the 
     * queue server for acquiring a lock, and wait until the lock has been 
     * acquired, run the task automatically.
     */
    push(task: (next: () => void) => void) {
        if (!this.connection) {
            throw new Error("cannot push task before the queue is connected");
        } else if (this.connection.destroyed) {
            throw new Error("cannot push task after the queue has disconnected");
        }

        let id = uuid(),
            next = () => {
                this.sendMsg("release", id);
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
        this.sendMsg("acquire", id);

        return this;
    }

    /**
     * Returns `true` if the queue is connected to the server, `false` otherwise.
     */
    get connected() {
        return !!this.connection && !this.connection.destroyed;
    }

    /**
     * Returns the length of tasks in the queue waiting to run.
     * (Note that this property only returns the task left in the current queue
     * instance, use `getRealLength()` to fetch the real length in the queue 
     * server.)
     */
    get length() {
        return Object.keys(this.tasks).length;
    }

    /** Gets the real queue length in the queue server. */
    getRealLength(): Promise<number> {
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
            this.sendMsg("getLength", id);
        });
    }

    private sendMsg(event: string, id?: string) {
        this.lastMsg = [event, id];
        this.connection.write(send(event, id), () => {
            this.lastMsg = null;
        });
    }
}

export default CPQueue;