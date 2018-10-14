# CP-Queue

**A cross-platform, cross-process asynchronous queue implementation for NodeJS.**

## Purpose

This package is meant to achieve sequential operations cross processes in 
multi-processing scenario.

When you're programming that your code will run in several sub-processes, say, 
in cluster mode, and you have to write data to a file, you will need to check if
that file exists or not. If the file is missing, you create that file. All these 
operations are asynchronous (even synchronous), they are running in parallel in 
different processes, there is no way to guarantee that which operation will be 
finished first. You may have tested that the file doesn't exists in process A, 
and about to create that file, meanwhile, before creation, process B, tested the
file doesn't exist as well, and try to create the file again. Now the problem is
quite clear, the two processes, A and B, will both try to create that file, even
before B do the creation, A already created it, because the awareness of B is 
late. So We require a tool to sequence the operation cross those processes, and 
make them run in order.

You may have noticed that there are several packages on [NPM](https://npmjs.com)
that call themselves *file-locker*, well, I can tell you very few of them are 
thread-safe. Be cause most of they perform file-existence checking just like I 
told above, which is absolutely not safe in multi-processing scenario. But, I'd 
like to point out some of them actually work. like 
[os-lock](https://npmjs.com/package/os-lock), it acquires the lock from system
API, and can work both in Windows and Linux (other platform is unknown, and 
requires NodeJS version higher than 10). Also, package 
[fs-ext](https://npmjs.com/package/fs-ext) provides file lock works in Unix-Like
systems based on `fcntl` API. These two packages both require you installing and 
compiling extra binary code, which sometimes it might fail due to environment 
needs not fulfilled.

But CP-Queue, is pure JavaScript, based on IPC sockets, do not need any extra 
effort to install and run. It's safe, and much simpler than other packages.

## Example

In this example, I will use cluster to fork several child-processes, but using 
cluster is optional, you can just use `child_process` module as you want.

```javascript
// task.js
const CPQueue = require("cp-queue").default;

(async () => {
    var queue = new CPQueue();

    await queue.connect();

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

## API

There are very few API in this package, it's designed to be as simple as it can,
but brings the most powerful queue-lock function cross processes into NodeJS.

- `new CPQueue()` create a queue instance.
- `queue.length: number` Returns the length of tasks in the queue that wait to 
    run.
- `queue.connected: boolean` Returns `true` if the queue is connected to the 
    server, `false` otherwise.
- `queue.connect(timeout?: number): Promise<this>` Opens connection for the instance to a 
    cross-process queue server, the server will be auto-started if it hasn't.
    - `timeout` This parameter sets both connection timeout and max lock time, 
        means if you don't call `next()` in a task (or the process fails to call
        it, i.e. exits unexpected), the next task will be run anyway when 
        timeout.

    This method also supports another signature:
    - `queue.connect(timeout: number, handler: (err: Error) => void): this`
        - `handler` You can put logic here to run after the connection is 
            established.
- `queue.disconnect(): void` Closes connection to the queue server. When the 
    queue is disconnected, no more task should be pushed or a socket error will 
    be thrown.
- `queue.push(task: (next: () => void) => void): this` Pushes a task into the 
    queue, the program will send a request to the queue server for acquiring a 
    lock, and wait until the lock has been acquired, run the task automatically.
- `queue.onError(handler: (err: Error) => void): this` Binds an error handler to
    run whenever the error occurred.
- `queue.closeServer(): void` Closes the queue server. Most often you don't need
    to call this method, and it may not work well if there are any tasks left in 
    any process, since a process will always try to re-build the server if it 
    finds connection lost.

### More About Queue Server

When you calling `queue.connect()`, this method will firstly try to connect to a
queue server, if the server doesn't exist, it will create a new one. You don't 
have to worry that the program will try to create the server several times since
it may run in multiple processes. Well, it will not. This package itself has an 
inner algorithm to decide when and which process should host the queue server, 
and other processes will just try to connect it.