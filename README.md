# CP-Queue

**A cross-platform, cross-process asynchronous queue implementation for NodeJS.**

## Purpose

This package is meant to achieve sequential operations cross processes in 
multi-processing scenario.

### An Example Of Why

When you're programming that your code will run in several sub-processes, say, 
in cluster mode, and you have to write data to a file, you will need to check if
that file exists or not. If the file is missing, you create that file. All these 
operations are asynchronous (even synchronous), they are running in parallel in 
different processes, there is no way to guarantee that which operation will be 
finished first. You may have tested that the file doesn't exists in process A, 
and about to create that file, meanwhile, before creation, process B, tested the
file doesn't exist as well, and try to create the file again. Now the problem is
quite clear, the two processes, A and B, will both try to create that file, even
before B doing the creation, A already created it, because B never knows it. So 
We need a tool to sequence the operation cross those processes, and make them
run in a certain order.

### File-Lock Doesn't Always Lock

You may have noticed that there are several packages on [NPM](https://npmjs.com)
that call themselves *file-locker*, well, I can tell you very few of them are 
thread-safe. Because most of them perform file-existence checking just like I 
said above, which is absolutely not safe in multi-processing scenario. But, I'd 
like to point out some of them actually work. like 
[fs-ext](https://github.com/baudehlo/node-fs-ext) and
[os-lock](https://github.com/mohd-akram/os-lock), they acquire file lock from 
system API, and can work both in Windows and Unix-Like systems. However, these 
two packages both require you installing and compiling extra binary code, which 
sometimes it might fail due to environment needs not fulfilled, and by the way, 
they are only available for NodeJS 8+, no support for older versions.

### Say Bye-Bye To Redis

Of course there is another way to implement cross-process queue based on Redis.
However, do you really need it? It is a good idea to store cache in Redis, and 
many other features are perfectly when you're building a large program. But, 
only for a queue that runs cross processes? It is definitely not the best choice,
it's even more complicated to install a Redis server (and client binary code) 
than installing **fs-ext** or **os-lock**.

### A Better Choice

With CP-Queue, it is pure JavaScript, based on IPC channel 
([open-channel](https://github.com/hyurl/open-channel)), do not need any 
extra effort to install and run. It's safe, and much handy than other packages, 
it not only provides you the ability to lock file operations, but any operations
you want to handle in order.

## How To Use?

```javascript
// task.js
const CPQueue = require("cp-queue");

var queue = CPQueue.connect();

// push a task into the queue and waiting to run. 
queue.push((next) => {
    // TODO...
    next(); // calling next to prepare running the next task.
});

// push another task
queue.push((next) => {
    // TODO...
    next();
});
```

In this example, I will use cluster to fork several child-processes, but using 
cluster is optional, you can just use `child_process` module as you want, or 
even run them manually (must provide the absolute path of the script file, e.g.
`node $(pwd)/task.js`).

```javascript
// index.js
const cluster = require("cluster");

if (cluster.isMaster) {
    // fork 4 workers
    for (let i = 0; i < 4; i++) {
        cluster.fork();
    }
} else {
    // There would be 8 task to run in all processes (2 for each process), and 
    // they're all run in order (but cannot guarantee the sequence).
    require("./task");
}
```

## API

There are very few API in this package, it's designed to be as simple as 
possible, but brings the most powerful queue-lock function cross processes into 
NodeJS.

- `CPQueue.connect(name: string, timeout?: number): CPQueue.Client>`
    Opens connection to a cross-process queue server and returns a client 
    instance.
    - `name` A unique name to distinguish potential queues on the same machine.
    - `timeout` Sets both connection timeout and max lock time, meaning if you 
        don't call `next()` in a task (or the process fails to call it, i.e. 
        exits unexpected), the next task will be run anyway when timeout. The 
        default value is `5000` ms.

- `queue.connected: boolean` Returns `true` if the queue is 
    connected to the server, `false` otherwise.
- `queue.disconnect(): void` Closes connection to the queue server.
- `queue.push(task: (next: () => void) => void): this` Pushes
    a task into the queue, the program will send a request to the server 
    acquiring for a lock, and wait until the lock has been acquired, run the 
    task automatically.
    - `next` Once the job is done, this callback function should be and must be 
        called.
- `queue.getLength(): Promise<number>` Gets the real queue length from the 
    server.
- `queue.onError(handler: (err: Error) => void): this` Binds an error handler to
    catch errors whenever occurred.

## What Can't CP-Queue Do?

- IPChannel requires all processes run with the same entry file, it won't work
    with multi-entry applications.
- IPChannel only supports communications on the same machine, it's not designed 
    for network communications with remote services.

## Tip

Powered by [open-channel](https://github.com/hyurl/open-channel), CP-Queue can 
work under [PM2](https://pm2.io) supervision even doesn't have access to the 
master process.

## License

This package is licensed under [MIT license](./LICENSE).