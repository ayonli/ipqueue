import * as net from "net";
import * as path from "path";
import findProcess = require("find-process");
import startsWith = require("lodash/startsWith");
import endsWith = require("lodash/endsWith");
import includes = require("lodash/includes");
import trimStart = require("lodash/trimStart");
import { createServer, getPort } from './server';

/** Entry script filename */
let script = process.mainModule.filename;

script = endsWith(script, ".js") ? script.slice(0, -3) : script;
script = endsWith(script, path.sep + "index") ? script.slice(0, -6) : script;

async function getHostPid() {
    let processes = await findProcess("name", "node");

    for (let item of processes) {
        let pid = parseInt(item.pid),
            cmd = trimStart(item.cmd, '"');

        if (startsWith(cmd, process.execPath) && includes(cmd, script)) {
            return pid;
        }
    }

    return process.pid;
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

function retryConnect(resolve, reject, timeout: number, pid: number) {
    let conn: net.Socket,
        retries = 0,
        maxRetries = Math.ceil(timeout / 50),
        timer = setInterval(async () => {
            retries++;
            conn = await getConnection(timeout, pid);

            if (conn) {
                resolve(conn);
                clearInterval(timer);
            } else if (retries === maxRetries) {
                clearInterval(timer);
                let err = new Error("failed to get connection after "
                    + Math.round(timeout / 1000) + " seconds timeout");
                reject(err);
            }
        }, 50);
}

export function getConnection(timeout = 5000, pid?: number) {
    return new Promise(async (resolve: (value: net.Socket) => void, reject) => {
        let conn: net.Socket;
        pid = pid || await getHostPid();

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

            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        } else {
            let server = await createServer(pid, timeout);
            if (server)
                conn = await tryConnect((<net.AddressInfo>server.address()).port);

            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        }
    });
}