"use strict";

require("source-map-support/register");
const cluster = require("cluster");
const assert = require("assert");

if (cluster.isMaster) {
    let workers = [],
        connected = 0,
        logs = [];

    for (let i = 0; i < 4; i++) {
        workers[i] = cluster.fork();

        workers[i].on("message", (msg) => {
            if (msg == "connected") {
                connected++;

                if (connected === 4) {
                    let timeout = 0,
                        i = 0,
                        sendMsg = () => {
                            let worker = workers[i++];
                            if (worker) {
                                worker.send(["ready", timeout += 100], () => {
                                    sendMsg();
                                });
                            }
                        };

                    sendMsg();
                }
            } else {
                logs.push(msg);

                if (logs.length == 8) {
                    let pids = workers.map(worker => worker.process.pid),
                        _logs = [],
                        __logs = [];

                    for (let pid of pids) {
                        _logs.push(pid + ": task A");
                        __logs.push(pid + ": task B");
                    }

                    _logs = _logs.concat(__logs);

                    try {
                        assert.deepStrictEqual(_logs, logs);
                        console.log("#### OK ####");
                        process.exit(0);
                    } catch (err) {
                        console.log(err);
                        process.exit(1);
                    }
                }
            }
        });
    }
} else {
    if (process.argv.includes("task-immediate")) {
        require("./task-immediate");
    } else {
        require("./task");
    }
}