import * as net from "net";
import { createServer, getSocketAddr } from './server';
import { getPid as getHostPid } from "first-officer";

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