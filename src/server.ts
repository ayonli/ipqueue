import * as net from "net";
import * as os from "os";
import * as fs from "fs-extra";
import first = require("lodash/first");
import { receive, send } from "./transfer";

type Task = { id: string, socket: net.Socket };
const Queues: {
    [port: number]: {
        current: Task["id"];
        tasks: Task[];
        timmer?: NodeJS.Timer;
    }
} = {};

// When a client acquires the queue lock, the first task in the queue should run.
// And when the client release the queue lock, remove the running task from the 
// queue, and run the next task.
export async function createServer(pid: number, timeout = 5000) {
    let server = net.createServer(socket => {
        let port = (<net.AddressInfo>server.address()).port;

        socket.on("data", (buf) => {
            for (let [event, data] of receive(buf)) {
                socket.emit(event, data);
            }
        }).on("acquire", (id: string) => {
            let queue = Queues[port];

            if (!queue)
                queue = Queues[port] = { current: void 0, tasks: [] };

            if (!queue.tasks.length) {
                // if the queue is empty, run the task immediately
                queue.current = id;
                !socket.destroyed && socket.write(send("acquired", id), () => {
                    // set a timer to force release when timeout.
                    queue.timmer = setTimeout(() => {
                        socket.emit("release");
                    }, timeout);
                });
            }

            if (!socket.destroyed)
                queue.tasks.push({ id, socket }); // push the task in the queue
        }).on("release", () => {
            let queue = Queues[port];

            queue.tasks.shift(); // remove the running task
            clearTimeout(queue.timmer);

            // run the next task
            let item = first(queue.tasks);
            if (item) {
                queue.current = item.id;
                if (!item.socket.destroyed) {
                    item.socket.write(send("acquired", item.id), () => {
                        queue.timmer = setTimeout(() => {
                            item.socket.emit("release");
                        }, timeout);
                    });
                } else {
                    socket.emit("release");
                }
            }
        }).on("closesServer", () => {
            server.close();
        }).on("error", (err) => {
            if (err.message.indexOf("socket has been ended") >= 0) {
                try {
                    socket.destroy();
                    socket.unref();
                } catch (err) { }
            }
        });
    });

    await new Promise((resolve, reject) => {
        server.once("error", (err) => {
            server.close();
            server.unref();

            // If the port is already in use, then throw the error, otherwise, 
            // just return null so that the program could retry.
            if (err["code"] == "EADDRINUSE") {
                reject(err);
            } else {
                resolve(null);
            }
        }).listen(() => {
            resolve(null);
        });
    });
    await setPort(pid, (<net.AddressInfo>server.address()).port);

    return server;
}

export async function setPort(pid: number, port: number) {
    let dir = os.tmpdir() + "/.cp-queue",
        file = dir + "/" + pid;

    await fs.ensureDir(dir);
    await fs.writeFile(file, port, "utf8");
}

export async function getPort(pid: number) {
    let file = os.tmpdir() + "/.cp-queue/" + pid;
    try {
        let data = await fs.readFile(file, "utf8");
        return parseInt(data) || 0;
    } catch (err) {
        return 0;
    }
}