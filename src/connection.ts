import * as net from "net";
import * as path from "path";
import startsWith = require("lodash/startsWith");
import endsWith = require("lodash/endsWith");
import trimStart = require("lodash/trimStart");
import { createServer, getSocketAddr } from './server';
const findProcess = require("find-process");


/** Entry script filename */
let script = process.mainModule.filename;

script = endsWith(script, ".js") ? script.slice(0, -3) : script;
script = endsWith(script, path.sep + "index") ? script.slice(0, -6) : script;

async function getHostPid() {
    let processes = await findProcess("name", "node", true);

    for (let item of processes) {
        let cmd = trimStart(item.cmd, '"');

        if (startsWith(cmd, process.execPath) && cmd.includes(script)) {
            return item.pid;
        }
    }

    return process.pid;
}

function tryConnect(addr: string | number): Promise<net.Socket> {
    return new Promise((resolve: (value: net.Socket) => void, reject) => {
        if (!addr)
            return resolve(null);

        let conn = net.createConnection(<any>addr);

        conn.on("error", (err) => {
            if (err["code"] == "ECONNREFUSED" || err["code"] == "ENOENT") {
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

async function tryServe(pid: number, addr: string | number, timeout: number): Promise<net.Socket> {
    try {
        let server = await createServer(pid, timeout);
        if (server) {
            let _addr = server.address();
            addr = typeof _addr == "object" ? _addr.port : _addr;
            return tryConnect(addr);
        }
    } catch (err) {
        if (err["code"] == "EADDRINUSE")
            return tryConnect(addr);
        else
            throw err;
    }
}

export function getConnection(timeout = 5000, pid?: number) {
    return new Promise(async (resolve: (value: net.Socket) => void, reject) => {
        pid = pid || await getHostPid();

        let addr = await getSocketAddr(pid),
            conn: net.Socket;

        if (process.connected) { // child process
            conn = await tryConnect(addr);

            if (!conn && pid === process.pid)
                conn = await tryServe(pid, addr, timeout);

            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        } else {
            conn = await tryServe(pid, addr, timeout);
            conn ? resolve(conn) : retryConnect(resolve, reject, timeout, pid);
        }
    });
}