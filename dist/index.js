"use strict";
var tslib_1 = require("tslib");
var events_1 = require("events");
var uuid = require("uuid/v4");
var connection_1 = require("./connection");
var transfer_1 = require("./transfer");
var CPQueue;
(function (CPQueue) {
    function connect() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var queue = new Client();
        return queue.connect.apply(queue, args);
    }
    CPQueue.connect = connect;
    var Client = (function () {
        function Client() {
            this.tasks = {};
        }
        Object.defineProperty(Client.prototype, "connected", {
            get: function () {
                return !!this.connection && !this.connection.destroyed;
            },
            enumerable: true,
            configurable: true
        });
        Client.prototype.connect = function () {
            var _this = this;
            var handler;
            if (typeof arguments[0] == "function") {
                this.timeout = 5000;
                handler = arguments[0];
            }
            else {
                this.timeout = arguments[0] || 5000;
                handler = arguments[1];
            }
            var createConnection = function () { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                var _this = this;
                var _a;
                return tslib_1.__generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            this.disconnect();
                            _a = this;
                            return [4, connection_1.getConnection(this.timeout)];
                        case 1:
                            _a.connection = _b.sent();
                            this.connection.on("data", function (buf) {
                                for (var _i = 0, _a = transfer_1.receive(buf); _i < _a.length; _i++) {
                                    var _b = _a[_i], event = _b[0], id = _b[1], extra = _b[2];
                                    _this.tasks[id].emit(event, id, extra);
                                }
                            }).on("error", function (err) { return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                var err_1;
                                return tslib_1.__generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (!(err["code"] == "ECONNREFUSED"
                                                || err.message.indexOf("socket has been ended") >= 0)) return [3, 6];
                                            _a.label = 1;
                                        case 1:
                                            _a.trys.push([1, 4, , 5]);
                                            if (!Object.keys(this.tasks).length) return [3, 3];
                                            return [4, this.connect(this.timeout)];
                                        case 2:
                                            _a.sent();
                                            if (this.lastMsg)
                                                this.send(this.lastMsg[0], this.lastMsg[1]);
                                            _a.label = 3;
                                        case 3: return [3, 5];
                                        case 4:
                                            err_1 = _a.sent();
                                            if (this.errorHandler)
                                                this.errorHandler(err_1);
                                            else
                                                throw err_1;
                                            return [3, 5];
                                        case 5: return [3, 7];
                                        case 6:
                                            if (this.errorHandler)
                                                this.errorHandler(err);
                                            else
                                                throw err;
                                            _a.label = 7;
                                        case 7: return [2];
                                    }
                                });
                            }); });
                            return [2, this];
                    }
                });
            }); };
            if (handler) {
                createConnection().then(function () {
                    handler(null);
                }).catch(function (err) {
                    handler(err);
                });
                return this;
            }
            else {
                return createConnection();
            }
        };
        Client.prototype.disconnect = function () {
            this.connected && this.connection.destroy();
        };
        Client.prototype.closeServer = function () {
            this.send("closeServer");
        };
        Client.prototype.onError = function (handler) {
            this.errorHandler = handler;
            if (this.connection)
                this.connection.on("error", handler);
            return this;
        };
        Client.prototype.push = function (task) {
            var _this = this;
            if (!this.connection) {
                throw new Error("cannot push task before the queue has connected");
            }
            else if (this.connection.destroyed) {
                throw new Error("cannot push task after the queue has disconnected");
            }
            var id = uuid(), next = function () {
                _this.send("release", id);
            };
            this.tasks[id] = new events_1.EventEmitter();
            this.tasks[id].once("acquired", function () {
                try {
                    delete _this.tasks[id];
                    task(next);
                }
                catch (err) {
                    if (_this.errorHandler)
                        _this.errorHandler(err);
                }
            });
            this.send("acquire", id);
            return this;
        };
        Client.prototype.getLength = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                if (!_this.connected)
                    return resolve(0);
                var id = uuid(), timer = setTimeout(function () {
                    reject(new Error("failed to get queue length"));
                }, _this.timeout);
                _this.tasks[id] = new events_1.EventEmitter();
                _this.tasks[id].once("gotLength", function (id, length) {
                    clearTimeout(timer);
                    try {
                        delete _this.tasks[id];
                        resolve(length);
                    }
                    catch (err) {
                        reject(err);
                    }
                });
                _this.send("getLength", id);
            });
        };
        Client.prototype.send = function (event, id) {
            var _this = this;
            this.lastMsg = [event, id];
            this.connection.write(transfer_1.send(event, id), function () {
                _this.lastMsg = null;
            });
        };
        return Client;
    }());
    CPQueue.Client = Client;
})(CPQueue || (CPQueue = {}));
module.exports = CPQueue;
//# sourceMappingURL=index.js.map