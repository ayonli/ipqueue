"use strict";

const CPQueue = require("..");

var queue = CPQueue.connect();

queue.socket.on("connect", () => {
    process.send("connected");
});

process.on("message", msg => {
    if (Array.isArray(msg) && msg[0] === "ready") {
        let timeout = msg[1];

        setTimeout(() => {
            queue.push((next) => {
                process.send(process.pid + ": task A", () => {
                    setTimeout(() => {
                        next();
                    }, 300);
                });
            });

            setTimeout(() => {
                queue.push((next) => {
                    process.send(process.pid + ": task B", () => {
                        next();
                    });
                });
            }, 500);
        }, timeout);
    }
});