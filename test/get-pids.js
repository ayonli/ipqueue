const findProcess = require("find-process");
const endsWith = require("lodash/endsWith");

function getPids() {
    return findProcess("name", "node").then(items => {
        let script = process.mainModule.filename,
            pids = [];

        script = endsWith(script, ".js") ? script.slice(0, -3) : script;
        script = endsWith(script, "/index") ? script.slice(0, -6) : script;

        for (let i = 0; i < items.length; i++) {
            let item = items[i],
                pid = parseInt(item.pid);
            if (item.name == "node" && item.cmd.lastIndexOf(script) >= 0) {
                pids.push(pid);
            }
        }

        return pids.sort();
    });
}

exports.getPids = getPids;