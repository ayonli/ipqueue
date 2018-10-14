import * as net from "net";
import findProcess = require("find-process");
import endsWith = require("lodash/endsWith");
import { createServer, getPort } from './server';

async function getHostPid() {
    let script = process.mainModule.filename,
        processes = await findProcess("name", "node"),
        pids: number[] = [];

    script = endsWith(script, ".js") ? script.slice(0, -3) : script;
    script = endsWith(script, "/index") ? script.slice(0, -6) : script;

    for (let item of processes) {
        let pid = parseInt(item.pid);
        if (item.name == "node" && item.cmd.lastIndexOf(script) >= 0) {
            pids.push(pid);
        }
    }

    return pids.length ? pids[0] : process.pid;
}

function tryConnect(port: number): Promise<net.Socket> {
    return new Promise((resolve: (value: net.Socket) => void, reject) => {
        if (!port)
            return resolve(null);

        let conn = net.createConnection(port);

        conn.on("error", (err) => {
            if (err["code"] == "ECONNREFUSED") {
                resolve(null);
            } else {
                reject(err);
            }
        }).on("connect", () => {
            resolve(conn);
        });
    });
}

function retryConnect(resolve, reject, timeout) {
    let conn: net.Socket,
        retries = 0,
        maxRetries = Math.ceil(timeout / 10),
        timer = setInterval(async () => {
            retries++;
            conn = await getConnection(timeout);

            if (conn) {
                resolve(conn);
                clearInterval(timer);
            } else if (retries === maxRetries) {
                clearInterval(timer);
                let err = new Error("failed to get connection after "
                    + Math.round(timeout / 1000) + " seconds of timeout");
                reject(err);
            }
        }, 10);
}

export function getConnection(timeout = 5000) {
    return new Promise(async (resolve: (value: net.Socket) => void, reject) => {
        let conn: net.Socket,
            pid = await getHostPid();

        if (process.connected) { // child process
            conn = await tryConnect(await getPort(pid));

            if (!conn) {
                if (pid === process.pid) {
                    let server = await createServer(pid, timeout);
                    if (server) {
                        conn = await tryConnect((<net.AddressInfo>server.address()).port);
                    }
                }
            }

            conn ? resolve(conn) : retryConnect(resolve, reject, timeout);
        } else {
            let server = await createServer(pid, timeout);
            if (server)
                conn = await tryConnect((<net.AddressInfo>server.address()).port);

            conn ? resolve(conn) : retryConnect(resolve, reject, timeout);
        }
    });
}