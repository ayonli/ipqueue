"use strict";

const CPQueue = require("..").default;
const getPids = require("./get-pids").getPids;

getPids().then(pids => {
    console.log(pids);
    let timeout = 0;

    switch (process.pid) {
        case pids[0]:
            timeout = 100;
            break;
        case pids[1]:
            timeout = 200;
            break;
        case pids[2]:
            timeout = 300;
            break;
        case pids[3]:
            timeout = 400;
            break;
    }

    var queue = new CPQueue();

    queue.connect(5000, (err) => {
        if (err) {
            return console.log(err);
        }

        queue.push((next) => {
            setTimeout(() => {
                console.log(process.pid, "AAA");
                next();
            }, timeout);
        });

        setTimeout(() => {
            queue.push((next) => {
                setTimeout(() => {
                    console.log(process.pid, "BBB");
                    next();
                }, timeout);
            });
        }, 500);
    });
});
