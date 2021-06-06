"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
// api bridge for ha devices added in houmio
var Hapi = require("hapi");
var request = require("request");
require('log-timestamp');
var server = new Hapi.Server({
    port: 3003
});
var macIp = "localhost"; //"192.168.1.249"
var HA_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiIyOGRmZmU3NzkzNmI0MmM0YmQ1OTY0ZWZiODk4MjQyOSIsImlhdCI6MTU3MzI0MjY3MiwiZXhwIjoxODg4NjAyNjcyfQ.d1eG5hULMQSYkzy7o7_QkT2QkpEdlU5jBANKrMSwrjU";
var init = function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, server.start()];
            case 1:
                _a.sent();
                console.log("Server running at: " + server.info.uri);
                return [2 /*return*/];
        }
    });
}); };
server.route({
    method: "POST",
    path: "/{id}",
    handler: function (req, h) { return __awaiter(void 0, void 0, void 0, function () {
        var payload_1, id_1, status_1, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    console.log(JSON.stringify(req.payload));
                    payload_1 = req.payload;
                    id_1 = req.params.id;
                    if (!(req.payload && payload_1.state && typeof payload_1.state.on === "boolean" && id_1)) {
                        console.log("incoming data is invalid:", req.payload);
                        return [2 /*return*/, h.response().code(400)];
                    }
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var action = payload_1.state.on ? "turn_on" : "turn_off";
                            var body = __assign({ entity_id: id_1 }, payload_1.state.on && !id_1.includes("switch") ? { brightness: payload_1.state.bri } : {});
                            console.log(id_1, action, body, req.payload);
                            request({
                                method: "POST",
                                uri: "https://" + macIp + ":8123/api/services/homeassistant/" + action,
                                headers: {
                                    'Authorization': "Bearer " + HA_KEY,
                                    'Content-Type': 'application/json'
                                },
                                json: true,
                                body: body,
                                rejectUnauthorized: false
                                // requestCert: true
                                // agent: false
                            }, function (err, httpResponse, hassBody) {
                                console.log('hass response:', err, httpResponse.statusCode);
                                if (err || !httpResponse || httpResponse.statusCode !== 200) {
                                    console.error(hassBody);
                                    return resolve(500);
                                }
                                return resolve(200);
                            });
                        })];
                case 1:
                    status_1 = _a.sent();
                    return [2 /*return*/, h.response().code(status_1)];
                case 2:
                    err_1 = _a.sent();
                    console.error("error:", err_1, err_1.stack);
                    return [2 /*return*/, h.response().code(500)];
                case 3: return [2 /*return*/];
            }
        });
    }); }
});
process.on('unhandledRejection', function (err) {
    console.log("error", err, err.stack);
    process.exit(1);
});
process.on('uncaughtException', function (err) {
    console.error("error", err, err.stack);
});
init();
