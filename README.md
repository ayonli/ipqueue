# CP-Queue

**A cross-platform, cross-process asynchronous queue implementation for NodeJS.**

## Purpose

This package is meant to achieve sequential operations cross processes in 
multi-processing scenario.

### An Example

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

With CP-Queue, it is pure JavaScript, based on IPC sockets, do not need any 
extra effort to install and run. It's safe, and much handy than other packages, 
it not only provides you the ability to lock file operations, but any operations
you want to handle in order.

## How To Use?

In this example, I will use cluster to fork several child-processes, but using 
cluster is optional, you can just use `child_process` module as you want.

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
    // they're all run in order.
    require("./task");
}
```

```javascript
// task.js
const CPQueue = require("cp-queue");

(async () => {
    var queue = await CPQueue.connect();

    // push a task into the queue and waiting to run. 
    queue.push((next) => {
        // TODO...
        next(); // calling next to prepare running the next task.
    });

    // push another task
    queue.push((next) => {
        // ...
        next();
    });
})();
```

## API

There are very few API in this package, it's designed to be as simple as 
possible, but brings the most powerful queue-lock function cross processes into 
NodeJS.

- `CPQueue.connect(timeout?: number): Promise<CPQueue.Client>`
- `CPQueue.connect(handler: (err: Error) => void): CPQueue.Client`
- `CPQueue.connect(timeout: number, handler: (err: Error) => void): CPQueue.Client`
    Opens connection to a cross-process queue server and returns a client 
    instance. The server will be auto-started if it hasn't.
    - `timeout` This parameter sets both connection timeout and max lock time, 
        means if you don't call `next()` in a task (or the process fails to call
        it, i.e. exits unexpected), the next task will be run anyway when 
        timeout. The default value is `5000` ms.

- `CPQueue.Client.prototype.connected: boolean` Returns `true` if the queue is 
    connected to the server, `false` otherwise.
- `CPQueue.Client.prototype.connect(timeout?: number): Promise<this>` Same as 
    `CPQueue.connect()`. Use the later instead, it's more semantic.
- `CPQueue.Client.prototype.disconnect(): void` Closes connection to the queue 
    server. When the queue is disconnected, no more task should be pushed or a 
    socket error will be thrown.
- `CPQueue.Client.prototype.push(task: (next: () => void) => void): this` Pushes
    a task into the queue, the program will send a request to the queue server 
    for acquiring a lock, and wait until the lock has been acquired, run the 
    task automatically.
- `CPQueue.Client.prototype.getLength(): Promise<number>` Gets the real queue 
    length in the queue server.
- `CPQueue.Client.prototype.onError(handler: (err: Error) => void): this` Binds 
    an error handler to run whenever the error occurred.
- `CPQueue.Client.prototype.closeServer(): void` Closes the queue server. Most 
    often you don't need to call this method, and it may not work well if there 
    are any tasks left in any process, since a process will always try to 
    re-build the server if it finds connection lost.

### More About Queue Server

When you calling `CPQueue.connect()`, this method will firstly try to connect to
a queue server, if the server doesn't exist, it will create a new one. You don't 
have to worry that the program will try to create the server several times since
it may run in multiple processes. Well, it will not. This package itself has an 
inner algorithm to decide when and which process should ship the queue server, 
and other processes will just connect to it.

## How It Works?

For the people who wants to know the principle of the package or a way to 
implement a cross-process queue server, I'm here to share my idea.

The secret is quite simple, but yet somehow not well-known. The main idea is 
shipping a socket server in one of the sub-processes. This package uses 
[first-officer](https://github.com/hyurl/first-officer) to find out the proper
process that match `process.mainModule.filename` to ship the server. All 
sub-processes will (even master process can) connect to this server, the server 
will save the state of the queue, like the current running task id, etc.

When a task is pushed to the queue, it will send a request contains a unique 
task id (I prefer [uuid](https://github.com/kelektiv/node-uuid)) to the server 
to ask for a lock. The server will check if there is undone work, if a previous 
task is not finished (not released), the new task will be put in a queue 
(actually an array). When a task finishes and send a request to the server says 
release, the server will remove the finished task from the queue, and starts the
next task. By repeatedly running this procedure, the queue will work as expected
until you exit the process.

Of course more situation should be considered, e.g. the queue server process 
exits unexpected, other processes should listen the event when connection lost,
and try to ship a new server immediately. Another situation is that a process 
acquired the queue lock, and failed to release it, say the process exited before 
releasing the lock, the server should set a timer to force release when timeout.

**Why not ship the server in master process?** If you have full control of your 
program that is ok to ship the server in the master, but, if you program is 
running under the supervision of [PM2](https://github.com/Unitech/pm2), clearly 
you have no control of the master process, so shipping the server in one of the 
child-process is the best and safest way to keep your code running everywhere.