const cluster = require("cluster");
const getPids = require("./get-pids").getPids;

if (cluster.isMaster) {
    for (let i = 0; i < 4; i++) {
        cluster.fork();
    }
    // getPids().then(pids => {
    //     console.log(pids);
    // })
} else {
    require("./client");
}