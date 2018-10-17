import * as net from "net";
import * as os from "os";
import * as fs from "fs-extra";
import first = require("lodash/first");
import { receive, send } from "./transfer";

type Task = { id: string, socket: net.Socket };
const isWin32 = process.platform == "win32";
const Queue: {
    current: Task["id"];
    tasks: Task[];
    timmer?: NodeJS.Timer;
} = {
    current: void 0,
    tasks: [],
    timmer: null
};

// When a client acquires the queue lock, the first task in the queue should run.
// And when the client release the queue lock, remove the running task from the 
// queue, and run the next task.
export async function createServer(pid: number, timeout = 5000) {
    let server = net.createServer(socket => {
        socket.on("data", (buf) => {
            for (let [event, id, extra] of receive(buf)) {
                socket.emit(event, id, extra);
            }
        }).on("acquire", (id: string) => {
            if (!Queue.tasks.length) {
                // if the queue is empty, run the task immediately
                Queue.current = id;
                !socket.destroyed && socket.write(send("acquired", id), () => {
                    // set a timer to force release when timeout.
                    Queue.timmer = setTimeout(() => {
                        socket.emit("release");
                    }, timeout);
                });
            }

            if (!socket.destroyed)
                Queue.tasks.push({ id, socket }); // push the task in the queue
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
                        }, timeout);
                    });
                } else {
                    socket.emit("release");
                }
            }
        }).on("closesServer", () => {
            server.close();
        }).on("getLength", (id: string) => {
            let length = Queue.tasks.length;
            !socket.destroyed && socket.write(send("gotLength", id, length && length - 1));
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
        });

        if (isWin32) {
            // on Windows, bind a random port
            server.listen(() => {
                resolve(null);
            });
        } else {
            // on Uinx, bind to a domain socket
            getSocketAddr(pid).then(path => {
                server.listen(path, () => {
                    resolve(null);
                });
            });
        }
    });

    if (isWin32) {
        await setPort(pid, (<net.AddressInfo>server.address()).port);
    }

    return server;
}

async function setPort(pid: number, port: number) {
    let dir = os.tmpdir() + "/.cp-queue",
        file = dir + "/" + pid;

    await fs.ensureDir(dir);
    await fs.writeFile(file, port, "utf8");
}

export async function getSocketAddr(pid: number): Promise<string | number> {
    let dir = os.tmpdir() + "/.cp-queue",
        file = dir + "/" + pid;

    if (!isWin32) {
        await fs.ensureDir(dir);
        return file;
    }

    try {
        let data = await fs.readFile(file, "utf8");
        return parseInt(data) || 0;
    } catch (err) {
        return 0;
    }
}