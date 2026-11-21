"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalUrl = getLocalUrl;
const axios_1 = __importDefault(require("axios"));
const node_zlib_1 = require("node:zlib");
const node_https_1 = require("node:https");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const mime_types_1 = require("mime-types");
const adminCommonSocket_1 = __importStar(require("./adminCommonSocket"));
const MESSAGE_TYPES = {
    MESSAGE: 0,
    PING: 1,
    PONG: 2,
    CALLBACK: 3,
    READY: 4,
    WAIT: 5,
    SENDING_DONE: 6,
    MISSING: 7,
    TIMEOUT: 8,
    HTML: 9,
    COMBINED_CALLBACK: 10,
    COMBINED_MESSAGE: 11,
    /** MCP request of the cloud, answered via IoT like HTML */
    MCP: 12,
};
const MAX_IOT_MESSAGE_LENGTH = 127 * 1024;
// Reserve for the JSON envelope ({sid, i, l, d: [type, id, name, ...]}) around a packed payload
const MAX_IOT_PAYLOAD_LENGTH = MAX_IOT_MESSAGE_LENGTH - 1024;
// The events server forwards every POST as one WebSocket message to the browser.
// Messages of ~100 KB failed there with "internal error", so the payload is limited to 64 KB.
const MAX_POST_MESSAGE_LENGTH = 65 * 1024;
const MAX_POST_PAYLOAD_LENGTH = MAX_POST_MESSAGE_LENGTH - 1024;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const COLLECT_OBJS_MS = 400;
const COLLECT_STATES_MS = 400;
const COLLECT_LOGS_MS = 800;
// do not wait for the collect interval if more states are collected
const MAX_COLLECTED_STATES = 70;
// sockets without any request for this time are deleted
const SOCKET_INACTIVITY_MS = 30 * 3600 * 1000;
// trunks of big files, which were not confirmed by the cloud, are deleted after this time
const PACKETS_TTL_MS = 120000;
const MCP_TIMEOUT_MS = 60000;
// only these headers are forwarded to and from the local MCP server (no authorization, no cookies)
const MCP_REQUEST_HEADERS = ['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'];
const MCP_RESPONSE_HEADERS = ['content-type', 'mcp-session-id', 'mcp-protocol-version'];
const NONE = '___none___';
const INVALID_CONNECTION = 'invalid connectionId';
// local instances often use certificates, which are not issued for "localhost"
const localHttpsAgent = new node_https_1.Agent({ rejectUnauthorized: false });
/** Error objects cannot be serialized to JSON, so send their message */
function normalizeError(error) {
    return error instanceof Error ? error.message : error;
}
/**
 * Build the URL of the web server of an instance (admin, web or mcp) from its settings
 *
 * @param native settings of the instance
 * @param hostAddresses addresses of the host, if the instance runs on another host
 * @returns empty string, if the instance runs on another host and listens on all addresses, but the host has no usable address
 */
function getLocalUrl(native, hostAddresses) {
    let host = native.bind || '';
    const anyAddress = !host || host === '0.0.0.0' || host === '::';
    if (anyAddress && hostAddresses) {
        // loopback and link-local addresses of another host cannot be reached from here
        const usable = hostAddresses.filter(address => address && !/^127\./.test(address) && address !== '::1' && !/^fe80:/i.test(address));
        host = usable.find(address => !address.includes(':')) || usable[0] || '';
        if (!host) {
            return '';
        }
    }
    else if (!host || host === '0.0.0.0') {
        host = '127.0.0.1';
    }
    else if (host === '::') {
        host = 'localhost';
    }
    if (host.includes(':')) {
        host = `[${host}]`;
    }
    return `${native.secure ? 'https' : 'http'}://${host}:${native.port}`;
}
function parseMs(value, defaultMs) {
    const ms = parseInt(value, 10);
    return Number.isFinite(ms) && ms >= 0 ? ms : defaultMs;
}
class RemoteAccess {
    adapter;
    device = null;
    gcInterval = null;
    name = {};
    objects = {};
    packets = {};
    statesCache = {};
    listOfLogs = [];
    listOfStates = { ids: [], states: [] };
    listOfObjects = { ids: [], objs: [] };
    clientId;
    config;
    collectStatesMs;
    collectObjectsMs;
    collectLogsMs;
    handlers;
    subscribes = { stateChange: {}, objectChange: {}, log: {} };
    sockets = {};
    vendorPrefix = '';
    // pages of the installed admin adapter (undefined - not searched yet, null - not installed on this host)
    adminWwwDir;
    webObj = null;
    adminObj = null;
    lang = 'en';
    sendObjectsTimeout = null;
    sendLogsTimeout = null;
    sendStatesTimeout = null;
    infoTimeout = null;
    // changes of one type are sent one after another, else a client could receive an old value after a new one
    sending = { stateChange: false, objectChange: false, log: false };
    secret = '';
    constructor(adapter, clientId) {
        this.adapter = adapter;
        this.config = adapter.config;
        this.clientId = clientId;
        // empty strings from the configuration must not lead to NaN
        this.collectStatesMs = parseMs(this.config.collectStatesMs, COLLECT_STATES_MS);
        this.collectObjectsMs = parseMs(this.config.collectObjectsMs, COLLECT_OBJS_MS);
        this.collectLogsMs = parseMs(this.config.collectLogsMs, COLLECT_LOGS_MS);
        this.handlers = {
            getObject: { f: this.adapter.getForeignObjectAsync.bind(this.adapter), args: 1 },
            setObject: { f: this.adapter.setForeignObjectAsync.bind(this.adapter), args: 2 },
            getState: {
                // fill the cache, else updateState ignores the changes of this state
                f: (stateId) => this.adapter.getForeignStateAsync(stateId).then(state => {
                    if (stateId) {
                        this.statesCache[stateId] = JSON.stringify(state);
                    }
                    return state;
                }),
                args: 1,
            },
            setState: { f: this.adapter.setForeignStateAsync.bind(this.adapter), args: 2 },
            delState: { f: this.adapter.delForeignStateAsync.bind(this.adapter), args: 2 },
            getObjectView: { f: this.adapter.getObjectViewAsync.bind(this.adapter), args: 4 },
            delObject: { f: this.adapter.delForeignObjectAsync.bind(this.adapter), args: 2 },
            delObjects: { f: this.adapter.delForeignObjectAsync.bind(this.adapter), args: 2 },
            extendObject: { f: this.adapter.extendForeignObjectAsync.bind(this.adapter), args: 2 },
            getForeignStates: {
                // fill the cache, else updateState ignores the changes of these states
                f: (pattern) => this.adapter.getForeignStatesAsync(pattern).then(states => {
                    this._fillStatesCache(states);
                    return states;
                }),
                args: 1,
            },
            getForeignObjects: { f: this.adapter.getForeignObjectsAsync.bind(this.adapter), args: 2 },
            fileExists: { f: this.adapter.fileExistsAsync.bind(this.adapter), args: 2 },
            chownFile: { f: this.adapter.chownFileAsync.bind(this.adapter), args: 3 },
            chmodFile: { f: this.adapter.chmodFileAsync.bind(this.adapter), args: 3 },
            deleteFolder: { f: this.adapter.unlinkAsync.bind(this.adapter), args: 2 },
            deleteFile: { f: this.adapter.unlinkAsync.bind(this.adapter), args: 2 },
            mkdir: { f: this.adapter.mkdirAsync.bind(this.adapter), args: 2 },
            renameFile: { f: this.adapter.renameAsync.bind(this.adapter), args: 3 },
            readDir: { f: this.adapter.readDirAsync.bind(this.adapter), args: 2 },
            changePassword: { f: this.adapter.setPasswordAsync.bind(this.adapter), args: 2 },
        };
        if (!this.config.remote) {
            return;
        }
        if (this.config.remoteAdminInstance) {
            this.adapter
                .getForeignObjectAsync(`system.adapter.${this.config.remoteAdminInstance}`)
                .then(obj => {
                this.adminObj = obj || null;
            })
                .catch(e => this.adapter.log.error(`[REMOTE] Cannot read admin instance: ${e}`));
        }
        if (this.config.remoteWebInstance) {
            this.adapter
                .getForeignObjectAsync(`system.adapter.${this.config.remoteWebInstance}`)
                .then(obj => {
                this.webObj = obj || null;
            })
                .catch(e => this.adapter.log.error(`[REMOTE] Cannot read web instance: ${e}`));
        }
        this.adapter
            .getForeignObjectAsync('system.meta.uuid')
            .then(obj => {
            if (obj?.native) {
                this.vendorPrefix = obj.native.uuid.length > 36 ? obj.native.uuid.substring(0, 2) : '';
            }
        })
            .catch(e => this.adapter.log.error(`[REMOTE] Cannot read system UUID: ${e}`));
    }
    setLanguage(_lang) {
        this.lang = _lang || 'de';
    }
    registerDevice(device) {
        this.device = device;
    }
    /**
     * Send the collected changes of one type.
     * If the previous changes of this type are still being sent, the new ones are sent right after them,
     * so the client always gets the changes in the right order.
     */
    async _flush(type) {
        if (this.sending[type]) {
            return;
        }
        this.sending[type] = true;
        try {
            for (;;) {
                if (type === 'stateChange') {
                    const listOfStates = this.listOfStates;
                    if (!listOfStates.ids.length) {
                        break;
                    }
                    this.listOfStates = { ids: [], states: [] };
                    if (this.adapter.log.level === 'debug') {
                        this.adapter.log.debug(`[REMOTE] Send states: ${listOfStates.ids.map((id, i) => `${id}: ${listOfStates.states[i]?.val}`).join(', ')}`);
                    }
                    await this._sendChanges('stateChange', listOfStates.ids, listOfStates.states);
                }
                else if (type === 'objectChange') {
                    const listOfObjects = this.listOfObjects;
                    if (!listOfObjects.ids.length) {
                        break;
                    }
                    this.listOfObjects = { ids: [], objs: [] };
                    await this._sendChanges('objectChange', listOfObjects.ids, listOfObjects.objs);
                }
                else {
                    const listOfLogs = this.listOfLogs;
                    if (!listOfLogs.length) {
                        break;
                    }
                    this.listOfLogs = [];
                    await Promise.all(this._getSubscribedSockets('log').map(sid => this._sendChangeEvent(sid, 'log', [listOfLogs])));
                }
            }
        }
        finally {
            this.sending[type] = false;
        }
    }
    /** Get the sockets, which subscribed on the given ID (or on the logs) */
    _getSubscribedSockets(type, id) {
        return Object.keys(this.sockets).filter(sid => {
            const subscribes = this.sockets[sid]._subscribe[type];
            return !!subscribes?.length && (id === undefined || subscribes.some(s => s.regex.test(id)));
        });
    }
    /** Send to every socket only the changes it subscribed on. The sockets are served in parallel. */
    async _sendChanges(name, ids, values) {
        await Promise.all(Object.keys(this.sockets).map(sid => {
            const subscribes = this.sockets[sid]?._subscribe[name];
            if (!subscribes?.length) {
                return Promise.resolve();
            }
            const socketIds = [];
            const socketValues = [];
            for (let i = 0; i < ids.length; i++) {
                if (subscribes.some(s => s.regex.test(ids[i]))) {
                    socketIds.push(ids[i]);
                    socketValues.push(values[i]);
                }
            }
            if (!socketIds.length) {
                return Promise.resolve();
            }
            return this._sendChangeEvent(sid, name, [socketIds, socketValues]);
        }));
    }
    /**
     * Send a change event (stateChange, objectChange or log) to one socket.
     * The events Lambda forwards every POST as one WebSocket frame, which is limited to ~128 KB:
     * small events are sent unchanged, bigger ones packed and too big ones split into parts
     * (the browser collects the parts by ID, joins and unpacks them).
     */
    async _sendChangeEvent(sid, name, args) {
        // errors by sending of logs must not be logged, else every error creates a new log to send
        const silent = name === 'log';
        const json = JSON.stringify(args);
        if (Buffer.byteLength(json) <= MAX_POST_PAYLOAD_LENGTH) {
            await this._sendEvent({ name, args, sid, multi: true }, silent);
            return;
        }
        const packed = (0, node_zlib_1.deflateSync)(json).toString('base64');
        if (packed.length <= MAX_POST_PAYLOAD_LENGTH) {
            await this._sendEvent({ name, args: packed, sid, multi: true }, silent);
            return;
        }
        // one random ID per event, so the client can collect the parts
        const id = Math.round(Math.random() * 1000000000);
        const count = Math.ceil(packed.length / MAX_POST_PAYLOAD_LENGTH);
        for (let i = 0; i < count; i++) {
            const part = packed.substring(i * MAX_POST_PAYLOAD_LENGTH, (i + 1) * MAX_POST_PAYLOAD_LENGTH);
            const error = await this._sendEvent({ sid, d: [MESSAGE_TYPES.COMBINED_MESSAGE, id, name, part, count, i] }, silent);
            if (error) {
                break;
            }
        }
    }
    updateState(id, state) {
        if (!this.config.remote) {
            return;
        }
        const cache = JSON.stringify(state ?? null);
        // only the states, which were read by a client, are sent
        if (!this.statesCache[id] || this.statesCache[id] === cache) {
            return;
        }
        this.statesCache[id] = cache;
        if (!this._getSubscribedSockets('stateChange', id).length) {
            return;
        }
        if (this.config.debug) {
            this.adapter.log.debug(`[REMOTE] send stateChange "${id}": ${cache}`);
        }
        this.listOfStates.ids.push(id);
        this.listOfStates.states.push(JSON.parse(cache));
        // do not wait if the list will be too long
        if (this.listOfStates.ids.length > MAX_COLLECTED_STATES) {
            if (this.sendStatesTimeout) {
                clearTimeout(this.sendStatesTimeout);
                this.sendStatesTimeout = null;
            }
            this._flush('stateChange').catch(e => this.adapter.log.error(`[REMOTE] Cannot send cached states: ${e}`));
        }
        else {
            this.sendStatesTimeout ||= setTimeout(() => {
                this.sendStatesTimeout = null;
                this._flush('stateChange').catch(e => this.adapter.log.error(`[REMOTE] Cannot send cached states: ${e}`));
            }, this.collectStatesMs);
        }
    }
    updateObject(id, obj) {
        if (!this.config.remote || !this._getSubscribedSockets('objectChange', id).length) {
            return;
        }
        this.listOfObjects.ids.push(id);
        this.listOfObjects.objs.push(obj ? JSON.parse(JSON.stringify(obj)) : null);
        // the timer is not restarted by every change, else nothing is sent while objects change permanently
        this.sendObjectsTimeout ||= setTimeout(() => {
            this.sendObjectsTimeout = null;
            this._flush('objectChange').catch(e => this.adapter.log.error(`[REMOTE] Cannot send object changes: ${e}`));
        }, this.collectObjectsMs);
    }
    onLog(obj) {
        if (!this.config.remote || !this._getSubscribedSockets('log').length) {
            return;
        }
        this.listOfLogs.push(obj);
        // the timer is not restarted by every log line, else nothing is sent while something logs permanently
        this.sendLogsTimeout ||= setTimeout(() => {
            this.sendLogsTimeout = null;
            this._flush('log').catch(e => this.adapter.log.debug(`[REMOTE] Cannot send logs: ${e}`));
        }, this.collectLogsMs);
    }
    destroy() {
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
        }
        if (this.sendLogsTimeout) {
            clearTimeout(this.sendLogsTimeout);
            this.sendLogsTimeout = null;
        }
        if (this.sendObjectsTimeout) {
            clearTimeout(this.sendObjectsTimeout);
            this.sendObjectsTimeout = null;
        }
        if (this.sendStatesTimeout) {
            clearTimeout(this.sendStatesTimeout);
            this.sendStatesTimeout = null;
        }
        adminCommonSocket_1.default.stopGB();
        this._unsubscribeAll();
        this.sockets = {};
    }
    _clearMemory() {
        const now = Date.now();
        Object.keys(this.sockets).forEach(sid => {
            if (now - this.sockets[sid].ts > SOCKET_INACTIVITY_MS) {
                this._removeSocket(sid);
            }
        });
        Object.keys(this.packets).forEach(id => {
            if (now - this.packets[id].ts > PACKETS_TTL_MS) {
                delete this.packets[id];
            }
        });
    }
    _startGarbageCollector() {
        this.gcInterval ||= setInterval(() => this._clearMemory(), 60000);
    }
    /** Delete the socket and release its subscriptions */
    _removeSocket(sid) {
        if (this.sockets[sid]) {
            this._unsubscribeSocket(sid, 'stateChange');
            this._unsubscribeSocket(sid, 'objectChange');
            this._unsubscribeSocket(sid, 'log');
            delete this.sockets[sid];
        }
    }
    _readAllObjects() {
        return this.adapter.getObjectListAsync({ include_docs: true }).then(res => {
            const objects = {};
            this.adapter.log.info('[REMOTE] received all objects');
            if (res?.rows) {
                for (let i = 0; i < res.rows.length; i++) {
                    objects[res.rows[i].doc._id] = res.rows[i].doc;
                }
            }
            return objects;
        });
    }
    pattern2RegEx(pattern) {
        if (!pattern || typeof pattern !== 'string') {
            return null;
        }
        // IDs may contain characters with special meaning in regular expressions. Only "*" is a wildcard.
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        return `^${escaped}$`;
    }
    _subscribe(sid, type, pattern) {
        //console.log((socket._name || socket.id) + ' subscribe ' + pattern);
        const socket = this.sockets[sid];
        this.subscribes[type] ||= {};
        let s;
        if (socket) {
            socket._subscribe[type] ||= [];
            s = socket._subscribe[type];
            for (let i = 0; i < s.length; i++) {
                if (s[i].pattern === pattern) {
                    return;
                }
            }
        }
        const p = this.pattern2RegEx(pattern);
        if (p === null) {
            return this.adapter.log.warn('[REMOTE] Empty or invalid pattern on subscribe!');
        }
        if (s) {
            s.push({ pattern, regex: new RegExp(p) });
        }
        if (this.subscribes[type][pattern] === undefined) {
            this.subscribes[type][pattern] = 1;
            if (type === 'stateChange') {
                this.adapter.log.debug(`[REMOTE] Subscribe STATES: ${pattern}`);
                this.adapter.subscribeForeignStates(pattern);
            }
            else if (type === 'objectChange') {
                this.adapter.log.debug(`[REMOTE] Subscribe OBJECTS: ${pattern}`);
                this.adapter.subscribeForeignObjects?.(pattern);
            }
            else if (type === 'log') {
                this.adapter.log.debug('[REMOTE] Subscribe LOGS');
                void this.adapter.requireLog?.(true);
            }
        }
        else {
            this.subscribes[type][pattern]++;
        }
    }
    _showSubscribes(sid, type) {
        const socket = this.sockets[sid];
        if (socket?._subscribe) {
            const s = socket._subscribe[type] || [];
            const ids = [];
            for (let i = 0; i < s.length; i++) {
                ids.push(s[i].pattern);
            }
            this.adapter.log.debug(`[REMOTE] Subscribes: ${ids.join(', ')}`);
        }
        else {
            this.adapter.log.debug('[REMOTE] Subscribes: no subscribes');
        }
    }
    _updateConnectedInfo() {
        if (this.infoTimeout) {
            clearTimeout(this.infoTimeout);
            this.infoTimeout = null;
        }
        // TODO
        // this.adapter.setState('info.connection', text, true);
    }
    _unsubscribe(sid, type, pattern) {
        const socket = this.sockets[sid];
        this.subscribes[type] ||= {};
        if (socket && typeof socket === 'object') {
            if (!socket._subscribe?.[type]) {
                return;
            }
            for (let i = socket._subscribe[type].length - 1; i >= 0; i--) {
                if (socket._subscribe[type][i].pattern === pattern) {
                    // Remove pattern from global list
                    if (this.subscribes[type][pattern] !== undefined) {
                        this.subscribes[type][pattern]--;
                        if (this.subscribes[type][pattern] <= 0) {
                            if (type === 'stateChange') {
                                this.adapter.log.debug(`[REMOTE] Unsubscribe STATES: ${pattern}`);
                                //console.log((socket._name || socket.id) + ' unsubscribeForeignStates ' + pattern);
                                this.adapter.unsubscribeForeignStates(pattern);
                            }
                            else if (type === 'objectChange') {
                                this.adapter.log.debug(`[REMOTE] Unsubscribe OBJECTS: ${pattern}`);
                                //console.log((socket._name || socket.id) + ' unsubscribeForeignObjects ' + pattern);
                                this.adapter.unsubscribeForeignObjects &&
                                    this.adapter.unsubscribeForeignObjects(pattern);
                            }
                            else if (type === 'log') {
                                //console.log((socket._name || socket.id) + ' requireLog false');
                                this.adapter.log.debug('[REMOTE] Unsubscribe LOGS');
                                void this.adapter.requireLog?.(false);
                            }
                            delete this.subscribes[type][pattern];
                        }
                    }
                    socket._subscribe[type].splice(i, 1);
                    return;
                }
            }
        }
        else if (pattern) {
            // Remove pattern from global list
            if (this.subscribes[type][pattern] !== undefined) {
                this.subscribes[type][pattern]--;
                if (this.subscribes[type][pattern] <= 0) {
                    if (type === 'stateChange') {
                        this.adapter.log.debug(`[REMOTE] Unsubscribe STATES: ${pattern}`);
                        this.adapter.unsubscribeForeignStates(pattern);
                    }
                    else if (type === 'objectChange') {
                        this.adapter.log.debug(`[REMOTE] Unsubscribe OBJECTS: ${pattern}`);
                        this.adapter.unsubscribeForeignObjects?.(pattern);
                    }
                    else if (type === 'log') {
                        this.adapter.log.debug('[REMOTE] Unsubscribe LOGS');
                        void this.adapter.requireLog?.(false);
                    }
                    delete this.subscribes[type][pattern];
                }
            }
        }
    }
    _unsubscribeAll() {
        Object.keys(this.sockets).forEach(sid => this._removeSocket(sid));
    }
    _unsubscribeSocket(sid, type) {
        const socket = this.sockets[sid];
        if (!socket?._subscribe?.[type]) {
            return;
        }
        for (let i = 0; i < socket._subscribe[type].length; i++) {
            const pattern = socket._subscribe[type][i].pattern;
            if (this.subscribes[type][pattern] !== undefined) {
                this.subscribes[type][pattern]--;
                if (this.subscribes[type][pattern] <= 0) {
                    if (type === 'stateChange') {
                        this.adapter.log.debug(`[REMOTE] Unsubscribe STATES: ${pattern}`);
                        this.adapter.unsubscribeForeignStates(pattern);
                    }
                    else if (type === 'objectChange') {
                        this.adapter.log.debug(`[REMOTE] Unsubscribe OBJECTS: ${pattern}`);
                        this.adapter.unsubscribeForeignObjects?.(pattern);
                    }
                    else if (type === 'log') {
                        this.adapter.log.debug(`[REMOTE] Unsubscribe LOGS: ${pattern}`);
                        void this.adapter.requireLog?.(false);
                    }
                    delete this.subscribes[type][pattern];
                }
            }
        }
    }
    _subscribeSocket(sid, type) {
        const socket = this.sockets[sid];
        if (!socket?._subscribe?.[type]) {
            return;
        }
        for (let i = 0; i < socket._subscribe[type].length; i++) {
            const pattern = socket._subscribe[type][i].pattern;
            if (this.subscribes[type][pattern] === undefined) {
                this.subscribes[type][pattern] = 1;
                if (type === 'stateChange') {
                    this.adapter.log.debug(`[REMOTE] Subscribe STATES: ${pattern}`);
                    this.adapter.subscribeForeignStates(pattern);
                }
                else if (type === 'objectChange') {
                    this.adapter.log.debug(`[REMOTE] Subscribe OBJECTS: ${pattern}`);
                    this.adapter.subscribeForeignObjects?.(pattern);
                }
                else if (type === 'log') {
                    this.adapter.log.debug('[REMOTE] Subscribe LOGS');
                    void this.adapter.requireLog?.(true);
                }
            }
            else {
                this.subscribes[type][pattern]++;
            }
        }
    }
    /**
     * Send a message to the client via the events server.
     *
     * @param message message to send
     * @param silent log errors only as debug
     * @returns error text or undefined if sent
     */
    _sendEvent(message, silent) {
        return axios_1.default
            .post('https://remote-events.iobroker.in/', message, {
            validateStatus: status => status === 200,
            timeout: 5000,
        })
            .then(() => undefined)
            .catch(error => {
            let errorMessage;
            if (error?.response) {
                errorMessage = error.response.data || error.response.status;
            }
            else {
                errorMessage = error?.message?.toString() || error;
            }
            if (errorMessage?.error === INVALID_CONNECTION) {
                // the client is disconnected
                if (this.sockets[message.sid]) {
                    this.adapter.log.debug(`[REMOTE] delete connection id ${message.sid}`);
                    this._removeSocket(message.sid);
                }
                return INVALID_CONNECTION;
            }
            // do not log the whole message, it can be very big
            const command = message.name || message.d?.[2];
            const text = `[REMOTE] Cannot send "${command}" to "${message.sid}": ${JSON.stringify(errorMessage)}`;
            if (silent) {
                this.adapter.log.debug(text);
            }
            else {
                this.adapter.log.warn(text);
            }
            return typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
        });
    }
    _fillStatesCache(states) {
        if (states) {
            Object.keys(states).forEach(stateId => (this.statesCache[stateId] = JSON.stringify(states[stateId])));
        }
    }
    async _getStatesManyArgs(args) {
        const response = [];
        for (let a = 0; a < args.length; a++) {
            const id = args[a][0];
            try {
                const result = await this.adapter.getForeignStatesAsync(id || '*');
                response[a] = [null, result];
                this._fillStatesCache(result);
            }
            catch (error) {
                response[a] = [normalizeError(error)];
            }
        }
        return response;
    }
    async _getStateManyArgs(args) {
        const response = [];
        for (let a = 0; a < args.length; a++) {
            const id = args[a][0];
            try {
                const result = await this.adapter.getForeignStateAsync(id || '*');
                response[a] = [null, result];
                this.statesCache[id] = JSON.stringify(result);
            }
            catch (error) {
                response[a] = [normalizeError(error)];
            }
        }
        return response;
    }
    async _getObjectManyArgs(args) {
        const response = [];
        for (let a = 0; a < args.length; a++) {
            const id = args[a][0];
            try {
                const result = await this.adapter.getForeignObjectAsync(id || '*');
                response[a] = [null, result];
            }
            catch (error) {
                response[a] = [normalizeError(error)];
            }
        }
        return response;
    }
    _subscribeManyArgs(sid, args) {
        const result = [];
        for (let a = 0; a < args.length; a++) {
            const pattern = args[a][0];
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this._subscribe(sid, 'stateChange', pattern[p]);
                }
            }
            else {
                this._subscribe(sid, 'stateChange', pattern);
            }
            result.push([null]);
        }
        return Promise.resolve(result);
    }
    async _unsubscribeManyArgs(sid, args) {
        const result = [];
        for (let a = 0; a < args.length; a++) {
            const pattern = args[a][0];
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this._unsubscribe(sid, 'stateChange', pattern[p]);
                }
            }
            else {
                this._unsubscribe(sid, 'stateChange', pattern);
            }
            result.push([null]);
        }
        return Promise.resolve(result);
    }
    uploadToServer(url, data, raw) {
        return axios_1.default
            .put(url, raw ? data.file : Buffer.from(data.file, 'base64'), {
            headers: {
                'Content-Type': data.mimeType,
            },
        })
            .then(() => {
            return true;
        })
            .catch(e => {
            console.log(e);
            return false;
        });
    }
    readUrlFile(url, path, sid, type, id) {
        return (0, axios_1.default)(url + path, {
            responseType: 'arraybuffer',
            validateStatus: status => status === 200,
            timeout: 5000,
            httpsAgent: localHttpsAgent,
            // admin redirects to the login page, which must not be delivered as the requested file
            maxRedirects: 0,
        })
            .then(response => {
            // replace port
            if (path.endsWith('_socket/info.js')) {
                response.data = response.data.toString();
                // var socketUrl = ":8084"; var socketSession = ""; window.sysLang = "ru"; window.socketForceWebSockets = false;
                // replace ":8084"; => "";
                response.data = response.data.replace(/":\d+";/, '"";');
            }
            return {
                file: Buffer.from(response.data).toString('base64'),
                mimeType: response.headers['content-type'] || 'text/plain',
            };
        })
            .catch(error => {
            this.adapter.log.warn(`[REMOTE] File ${url}${path} not found`);
            let errorMessage;
            if (error.response && error.response.status === 404) {
                errorMessage = 'Not exists';
            }
            else if (error.response &&
                (error.response.status === 401 || (error.response.status >= 300 && error.response.status < 400))) {
                errorMessage = 'Not authorised';
            }
            else {
                if (error.response) {
                    errorMessage = error.response.data || error.response.status;
                }
                else if (error.request) {
                    errorMessage = 'No answer';
                }
                else {
                    errorMessage = error.message;
                }
            }
            return { sid, d: [type, id, '', { error: errorMessage }] };
        });
    }
    /**
     * URL of the web server of an instance. The instance can run on another host of a multi-host system.
     *
     * @param obj instance object
     * @returns empty string if the address of the host is unknown
     */
    async _getInstanceUrl(obj) {
        const ownHost = this.adapter.common?.host;
        let hostAddresses = null;
        if (obj.common?.host && ownHost && obj.common.host !== ownHost) {
            const hostObj = await this.adapter.getForeignObjectAsync(`system.host.${obj.common.host}`);
            hostAddresses = hostObj?.common?.address || [];
        }
        return getLocalUrl(obj.native, hostAddresses);
    }
    /**
     * URL of the configured admin instance.
     * Admin delivers its pages (e.g. "/img/...") also with authentication, only "/adapter/..." requires a login.
     */
    async _getAdminUrl() {
        if (!this.config.remoteAdminInstance) {
            return '';
        }
        const obj = await this.adapter.getForeignObjectAsync(`system.adapter.${this.config.remoteAdminInstance}`);
        return obj?.native ? this._getInstanceUrl(obj) : '';
    }
    /** URL of the configured web instance, if it can be read without authentication */
    async _getWebUrl() {
        if (!this.config.remoteWebInstance) {
            return '';
        }
        const obj = await this.adapter.getForeignObjectAsync(`system.adapter.${this.config.remoteWebInstance}`);
        return obj?.native && !obj.native.auth ? this._getInstanceUrl(obj) : '';
    }
    /** Directory with the pages of the installed admin adapter, which admin serves from the disk */
    _getAdminWwwDir() {
        if (this.adminWwwDir === undefined) {
            try {
                const dir = (0, node_path_1.join)((0, node_path_1.dirname)(require.resolve('iobroker.admin/package.json')), 'adminWww');
                this.adminWwwDir = (0, node_fs_1.existsSync)(dir) ? dir : null;
            }
            catch {
                this.adminWwwDir = null;
            }
            if (!this.adminWwwDir) {
                this.adapter.log.debug('[REMOTE] Pages of iobroker.admin were not found on this host');
            }
        }
        return this.adminWwwDir;
    }
    /**
     * Read a page file of the installed admin adapter.
     * HTML files are not read: admin fills them as templates.
     *
     * @param fileName path relative to the admin pages, e.g. "img/no-image.svg"
     * @returns null if the file cannot be read from the disk
     */
    async _readAdminWwwFile(fileName) {
        // the installed pages are only valid if the configured admin runs on this host
        const adminHost = this.adminObj?.common?.host;
        if (adminHost && adminHost !== this.adapter.common?.host) {
            return null;
        }
        const dir = this._getAdminWwwDir();
        if (!dir || !fileName || fileName.endsWith('/') || /\.html?$/i.test(fileName)) {
            return null;
        }
        const fullPath = (0, node_path_1.join)(dir, fileName);
        // do not leave the directory with ".."
        if (!fullPath.startsWith(dir + node_path_1.sep)) {
            return null;
        }
        try {
            const file = await (0, promises_1.readFile)(fullPath);
            return { file: file.toString('base64'), mimeType: (0, mime_types_1.lookup)(fullPath) || 'application/octet-stream' };
        }
        catch {
            return null;
        }
    }
    /**
     * Read a file of the adapter configuration pages like admin does for "/adapter/<adapter>/<file>":
     * from the file storage "<adapter>.admin" and, if not found there, from the local admin instance.
     *
     * @param name "/adapter/<adapter>/<file>" or "/admin/adapter/<adapter>/<file>", optionally with query
     * @param sid session ID
     * @param type message type
     * @param id message ID
     */
    _readAdapterFile(name, sid, type, id) {
        // "/admin/adapter/cloud/cloud.png?0" => "/adapter/cloud/cloud.png?0"
        const adminPath = name.replace(/^\/admin\//, '/');
        // ["", "adapter", "cloud", "cloud.png"]
        const parts = adminPath.split('?')[0].split('/').slice(2);
        const adapterName = parts.shift() || '';
        let fileName = parts.join('/');
        if (!fileName || fileName.endsWith('/')) {
            fileName += 'index.html';
        }
        const notExists = { sid, d: [type, id, '', { error: 'Not exists' }] };
        if (!adapterName || adapterName === '..' || fileName.split('/').includes('..')) {
            return Promise.resolve(notExists);
        }
        return this.adapter
            .readFileAsync(`${adapterName}.admin`, fileName)
            .then(data => ({ file: Buffer.from(data.file).toString('base64'), mimeType: data.mimeType }))
            .catch(async () => {
            const adminUrl = await this._getAdminUrl();
            if (adminUrl) {
                // admin serves its own files from the disk
                return this.readUrlFile(adminUrl, adminPath, sid, type, id);
            }
            this.adapter.log.debug(`[REMOTE] File ${adapterName}.admin/${fileName} not found`);
            return notExists;
        });
    }
    /**
     * Build the answer to a request, which is published via IoT (HTML, MCP).
     * A payload, which does not fit into one IoT message, is split into trunks. The trunks are kept
     * to resend them on MISSING, until the cloud confirms them with SENDING_DONE.
     *
     * @param sid session ID
     * @param _type message type of the request
     * @param id ID of the request
     * @param packed deflated and base64 encoded payload
     * @returns one message or the trunks
     */
    _splitForIot(sid, _type, id, packed) {
        if (packed.length <= MAX_IOT_PAYLOAD_LENGTH) {
            return { sid, d: [_type, id, '', packed] };
        }
        const count = Math.ceil(packed.length / MAX_IOT_PAYLOAD_LENGTH);
        const trunks = [];
        for (let i = 0; i < count; i++) {
            trunks.push({
                sid,
                i,
                l: count,
                d: [_type, id, '', packed.substring(i * MAX_IOT_PAYLOAD_LENGTH, (i + 1) * MAX_IOT_PAYLOAD_LENGTH)],
            });
        }
        // key by session too: the Lambda may use the same ID for parallel requests
        this.packets[`${sid}_${id}`] = { ts: Date.now(), trunks };
        // start garbage collector
        this._startGarbageCollector();
        return trunks;
    }
    _sendResponse(sid, _type, id, name, args, writeUrl, readUrl) {
        let packed = (0, node_zlib_1.deflateSync)(JSON.stringify(args)).toString('base64');
        // the answer is always sent via the events server (POST), not via IoT
        if (packed.length > MAX_POST_PAYLOAD_LENGTH) {
            if (writeUrl) {
                if (args.length === 3) {
                    const [error, file, mimeType] = args;
                    if (!error) {
                        return this.uploadToServer(writeUrl, { file, mimeType }, true).then(done => ({
                            sid,
                            d: [_type, id, name, done ? readUrl : ['Cannot upload']],
                        }));
                    }
                }
                else if (args.length === 2) {
                    const [error, result] = args;
                    if (!error) {
                        return this.uploadToServer(writeUrl, { file: JSON.stringify(result), mimeType: 'application/json' }, true).then(done => ({ sid, d: [_type, id, name, done ? readUrl : ['Cannot upload']] }));
                    }
                }
                else if (args.length === 1) {
                    const [result] = args;
                    return this.uploadToServer(writeUrl, { file: JSON.stringify(result), mimeType: 'application/json' }, true).then(done => ({ sid, d: [_type, id, name, done ? readUrl : ['Cannot upload']] }));
                }
            }
            // too big message. Do not use iot for that and send directly to socket
            /*const packets = []
            while (packed.length > MAX_IOT_MESSAGE_LENGTH) {
                const trunk = packed.substring(0, MAX_IOT_MESSAGE_LENGTH);
                packed = packed.substring(MAX_IOT_MESSAGE_LENGTH);
                packets.push(trunk);
            }
            if (packed.length) {
                packets.push(packed);
            }

            const trunks = packets.map((trunk, i) =>
                sid: message.sid, i, l: packets.length, d: [_type, id, name, trunk]}));

            this.packets[id] = {ts: Date.now(), trunks};

            // start garbage collector
            this._startGarbageCollector();

            return trunks;*/
            setImmediate(async () => {
                if (packed.length > MAX_POST_PAYLOAD_LENGTH) {
                    // too big message. Do not use iot for that and send directly to socket
                    const packets = [];
                    while (packed.length > MAX_POST_PAYLOAD_LENGTH) {
                        const trunk = packed.substring(0, MAX_POST_PAYLOAD_LENGTH);
                        packed = packed.substring(MAX_POST_PAYLOAD_LENGTH);
                        packets.push(trunk);
                    }
                    if (packed.length) {
                        packets.push(packed);
                    }
                    for (let i = 0; i < packets.length; i++) {
                        const error = await this._sendEvent({
                            sid,
                            d: [_type, id, name, packets[i], packets.length, i],
                        });
                        if (error) {
                            // already logged
                            break;
                        }
                    }
                }
                else {
                    await this._sendEvent({ sid, d: [_type, id, name, packed] });
                }
            });
            return Promise.resolve({ sid, d: [MESSAGE_TYPES.WAIT, id, name, [packed.length]] });
        }
        return Promise.resolve({ sid, d: [_type, id, name, packed] });
    }
    onCloudDisconnect() {
        // delete all sockets
        this.adapter.log.debug(`[REMOTE] Cloud disconnected`);
        if (!this.sockets) {
            return;
        }
        Object.keys(this.sockets).forEach(sid => this._removeSocket(sid));
    }
    process(request, serviceType) {
        let message;
        if (typeof request === 'string') {
            try {
                message = JSON.parse(request);
            }
            catch {
                this.adapter.log.error(`[REMOTE] Cannot parse request: ${request}`);
                message = null;
            }
        }
        else {
            message = request;
        }
        if (message && !Array.isArray(message.d)) {
            return Promise.reject(new Error('Invalid message'));
        }
        if (message) {
            const [_type, id, name, args, readUrl] = message.d;
            let promiseOne; // answer will be created automatically (error, result)
            let promiseResult; // answer will be created by promise
            if (this.config.remote && _type === MESSAGE_TYPES.MISSING) {
                const packet = this.packets[`${message.sid}_${id}`];
                if (packet) {
                    const missing = args[0];
                    this.adapter.log.warn(`[REMOTE] Request for existing trunks: ${id}, "${name}": ${JSON.stringify(missing)}`);
                    if (this.device && Array.isArray(missing)) {
                        setImmediate(async () => {
                            try {
                                for (let m = 0; m < missing.length; m++) {
                                    const trunk = packet.trunks[missing[m]];
                                    if (!trunk) {
                                        this.adapter.log.warn(`[REMOTE] Requested trunk ${missing[m]} of ${id}, "${name}" does not exist`);
                                        continue;
                                    }
                                    await new Promise((resolve, reject) => this.device.publish(`response/${this.clientId}/${serviceType}`, JSON.stringify(trunk), { qos: 1 }, error => {
                                        if (error) {
                                            reject(error);
                                        }
                                        else {
                                            resolve();
                                        }
                                    }));
                                }
                            }
                            catch (err) {
                                this.adapter.log.error(`[REMOTE] Cannot send packet: ${err}`);
                            }
                        });
                    }
                }
                else {
                    this.adapter.log.warn(`[REMOTE] Request for non existing trunks: ${id}, "${name}"`);
                }
                promiseResult = Promise.resolve(NONE);
            }
            else if (this.config.remote && _type === MESSAGE_TYPES.SENDING_DONE) {
                this.adapter.log.debug(`[REMOTE] Packet received: ${id}, "${name}"`);
                delete this.packets[`${message.sid}_${id}`];
                promiseResult = Promise.resolve(NONE);
            }
            else if (_type === MESSAGE_TYPES.HTML) {
                let promiseFile;
                if (!this.config.remote) {
                    return Promise.resolve({ sid: message.sid, d: [_type, id, '', ['Not enabled']] });
                }
                else if (name === 'listOfPrograms' || name === '/listOfPrograms') {
                    promiseFile = adminCommonSocket_1.default.getListOfAllAdapters(this.adapter)
                        .then(result => {
                        const packed = (0, node_zlib_1.deflateSync)(JSON.stringify([null, result])).toString('base64');
                        return { sid: message.sid, d: [_type, id, '', packed] };
                    })
                        .catch(error => ({
                        sid: message.sid,
                        d: [_type, id, '', [error.toString()]],
                    }));
                }
                else if (name === 'vendorPrefix' || name === '/vendorPrefix') {
                    return Promise.resolve({ sid: message.sid, d: [_type, id, '', [null, this.vendorPrefix]] });
                }
                else if (/^\/(admin\/)?adapter\//.test(name)) {
                    // the admin pages use relative links, so the files come as "/admin/adapter/<adapter>/<file>"
                    promiseFile = this._readAdapterFile(name, message.sid, _type, id);
                }
                else {
                    const path = name.split('?')[0];
                    const parts = path.split('/');
                    parts.shift(); // remove leading /
                    const _adapter = parts.shift() || '';
                    this.adapter.log.debug(`[REMOTE] HTML: ${path}`);
                    const isAdminPage = _adapter === 'admin' && path.startsWith('/admin/');
                    // html must be returned only by iot channel, as lambda must process the answer
                    const readFromStorage = () => this.adapter
                        .readFileAsync(_adapter, parts.join('/'))
                        .then(data => {
                        data.file = Buffer.from(data.file).toString('base64');
                        return data;
                    })
                        .catch(async () => {
                        const adminUrl = isAdminPage ? await this._getAdminUrl() : '';
                        if (adminUrl) {
                            // admin serves "/admin/img/x.svg" as "/img/x.svg" too
                            return this.readUrlFile(adminUrl, name.substring('/admin'.length), message.sid, _type, id);
                        }
                        // the path must be absolute, else it could change the host of the URL
                        const webUrl = path.startsWith('/') ? await this._getWebUrl() : '';
                        if (webUrl) {
                            // try to read from server
                            return this.readUrlFile(webUrl, path, message.sid, _type, id);
                        }
                        return {
                            sid: message.sid,
                            d: [_type, id, '', { error: 'Not exists' }],
                        };
                    });
                    if (isAdminPage) {
                        // admin serves its pages from the installation directory and does not upload them
                        promiseFile = this._readAdminWwwFile(parts.join('/')).then(data => data || readFromStorage());
                    }
                    else {
                        promiseFile = readFromStorage();
                    }
                }
                return promiseFile.then((data) => {
                    // if error
                    if (data.sid) {
                        return Promise.resolve(data);
                    }
                    const dataFile = data;
                    const canUpload = typeof args === 'string' && args.startsWith('https:');
                    // do not pack big files, which will be rejected anyway
                    const packed = !canUpload && dataFile.file.length > MAX_FILE_SIZE
                        ? ''
                        : (0, node_zlib_1.deflateSync)(JSON.stringify(data)).toString('base64');
                    if (typeof args === 'string' &&
                        args?.startsWith('https:') &&
                        packed.length > MAX_IOT_PAYLOAD_LENGTH) {
                        // upload file to temp server
                        return this.uploadToServer(args, dataFile).then(done => ({
                            sid: message.sid,
                            d: [_type, id, '', done ? '_$%URL' : 'Cannot upload'],
                        }));
                    }
                    if (dataFile.file.length > MAX_FILE_SIZE) {
                        // file too big
                        this.adapter.log.warn(`[REMOTE] Requested file ${name} is too big (${Math.round(dataFile.file.length / 1000)}Kb). Max length is ${MAX_FILE_SIZE / 1024}Kb`);
                        return Promise.resolve({
                            sid: message.sid,
                            d: [
                                _type,
                                id,
                                '',
                                {
                                    error: `File is too big: ${Math.round(dataFile.file.length / 1000)}Kb, max ${MAX_FILE_SIZE / 1024}Kb`,
                                },
                            ],
                        });
                    }
                    return Promise.resolve(this._splitForIot(message.sid, _type, id, packed));
                });
            }
            else if (_type === MESSAGE_TYPES.MCP) {
                // the answer is published via IoT, because the cloud (HTTP Lambda) waits for it synchronously
                if (!this.config.remote) {
                    return Promise.resolve({ sid: message.sid, d: [_type, id, '', { error: 'Not enabled' }] });
                }
                return this._mcpRequest(args)
                    .then(response => this._splitForIot(message.sid, _type, id, (0, node_zlib_1.deflateSync)(JSON.stringify(response)).toString('base64')))
                    .catch((error) => {
                    const text = String(normalizeError(error));
                    this.adapter.log.warn(`[REMOTE] Cannot process MCP request: ${text}`);
                    return { sid: message.sid, d: [_type, id, '', { error: text }] };
                });
            }
            if (!this.config.remote) {
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, ['Not enabled']] });
            }
            let isNew = false;
            if (this.sockets) {
                if (!this.sockets[message.sid]) {
                    this.adapter.log.debug(`[REMOTE] +++++ CONNECT ${message.sid}`);
                    this.sockets[message.sid] = {
                        _subscribe: {
                            stateChange: [],
                            objectChange: [],
                            log: [],
                        },
                        ts: Date.now(),
                    };
                    isNew = true;
                    // delete the sockets, which never disconnected
                    this._startGarbageCollector();
                }
                else {
                    this.sockets[message.sid].ts = Date.now();
                }
            }
            if (promiseResult) {
                // this answer will be processed at the very end of the function
            }
            else if (_type === MESSAGE_TYPES.COMBINED_CALLBACK || _type === MESSAGE_TYPES.COMBINED_MESSAGE) {
                let promiseMany;
                if (name === 'getStates') {
                    promiseMany = this._getStatesManyArgs(args);
                }
                else if (name === 'getState') {
                    promiseMany = this._getStateManyArgs(args);
                }
                else if (name === 'getObject') {
                    promiseMany = this._getObjectManyArgs(args);
                }
                else if (name === 'subscribe' || name === 'subscribeStates') {
                    promiseMany = this._subscribeManyArgs(message.sid, args);
                }
                else if (name === 'unsubscribe' || name === 'unsubscribeStates') {
                    promiseMany = this._unsubscribeManyArgs(message.sid, args);
                }
                else if (name === 'ppng') {
                    // ping
                    promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [0, isNew ? 0 : 1]] }); // 1 is OK, 0 is not OK
                }
                else {
                    // error
                    this.adapter.log.error(`[REMOTE] Received unknown multiple request: ${name}`);
                    promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, ['Unknown command']] });
                }
                if (promiseMany) {
                    promiseResult = promiseMany
                        .then(result => this._sendResponse(message.sid, _type, id, name, result))
                        /*      let packed = zlib.deflateSync(JSON.stringify(result)).toString('base64');

                            if (packed.length > MAX_IOT_MESSAGE_LENGTH) {
                                setImmediate(async () => {
                                    if (packed.length > MAX_POST_MESSAGE_LENGTH) {
                                        // too big message. Do not use iot for that and send directly to socket
                                        const packets = []
                                        while (packed.length > MAX_POST_MESSAGE_LENGTH) {
                                            const trunk = packed.substring(0, MAX_POST_MESSAGE_LENGTH);
                                            packed = packed.substring(MAX_POST_MESSAGE_LENGTH);
                                            packets.push(trunk);
                                        }
                                        if (packed.length) {
                                            packets.push(packed);
                                        }

                                        for (let i = 0; i < packets.length; i++) {
                                            const error = await this._sendEvent({sid: message.sid, d: [_type, id, name, packets[i], packets.length, i]});
                                            if (error) {
                                                this.adapter.log.error('[REMOTE] cannot send: ' + JSON.stringify(error));
                                                break;
                                            }
                                        }
                                    } else {
                                        await this._sendEvent({sid: message.sid, d: [_type, id, name, packed]});
                                    }
                                });
                                return {sid: message.sid, d: [MESSAGE_TYPES.WAIT, id, name, [packed.length]]};
                            } else {
                                return {sid: message.sid, d: [_type, id, name, packed]};
                            }
                        })*/
                        .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
                }
            }
            else if (Object.hasOwn(this.handlers, name)) {
                const argsArray = args;
                if (!this.handlers[name].args) {
                    promiseOne = this.handlers[name].f();
                }
                else if (this.handlers[name].args === 1) {
                    promiseOne = this.handlers[name].f(argsArray[0]);
                }
                else if (this.handlers[name].args === 2) {
                    promiseOne = this.handlers[name].f(argsArray[0], argsArray[1]);
                }
                else if (this.handlers[name].args === 3) {
                    promiseOne = this.handlers[name].f(argsArray[0], argsArray[1], argsArray[2]);
                }
                else if (this.handlers[name].args === 4) {
                    promiseOne = this.handlers[name].f(argsArray[0], argsArray[1], argsArray[2], argsArray[3]);
                }
                else if (this.handlers[name].args === 5) {
                    promiseOne = this.handlers[name].f(argsArray[0], argsArray[1], argsArray[2], argsArray[3], argsArray[4]);
                }
                else if (this.handlers[name].args === 6) {
                    promiseOne = this.handlers[name].f(argsArray[0], argsArray[1], argsArray[2], argsArray[3], argsArray[4], argsArray[5]);
                }
                else {
                    this.adapter.log.warn('[REMOTE] Unsupported number of arguments');
                }
            }
            else if (name === 'ppng') {
                // ping
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [null, !isNew]] });
            }
            else if (name === 'name') {
                const socketName = args?.[0];
                const socket = this.sockets[message.sid];
                if (!socket) {
                    // ignore
                }
                else if (socket.name === undefined) {
                    socket.name = socketName;
                    this.adapter.log.info(`[REMOTE] socket ${message.sid} connected with name "${socketName}"`);
                }
                else if (socket.name !== socketName) {
                    this.adapter.log.warn(`[REMOTE] socket ${message.sid} changed socket name from ${socket.name} to ${socketName}`);
                    socket.name = socketName;
                }
                // start garbage collector
                this._startGarbageCollector();
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, []] });
            }
            else if (name === 'authenticate') {
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [true, false]] });
            }
            else if (name === 'getObjects') {
                promiseOne = this._readAllObjects();
            }
            else if (name === 'getHostByIp') {
                promiseResult = adminCommonSocket_1.default.getHostByIp(this.adapter, args[0]).then(result => ({
                    sid: message.sid,
                    d: [_type, id, name, [result.ip, result.obj]],
                }));
            }
            else if (name === 'getStates') {
                promiseOne = this.adapter.getForeignStatesAsync(args[0] || '*').then(result => {
                    // fill the cache, else updateState ignores the changes of these states
                    this._fillStatesCache(result);
                    return result;
                });
            }
            else if (name === 'requireLog') {
                const isEnabled = args[0];
                if (isEnabled) {
                    this._subscribe(message.sid, 'log', 'dummy');
                }
                else {
                    this._unsubscribe(message.sid, 'log', 'dummy');
                }
                if (this.adapter.log.level === 'debug') {
                    this._showSubscribes(message.sid, 'log');
                }
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [null]] });
            }
            else if (name === 'DCT') {
                // disconnect
                const socket = this.sockets[message.sid];
                this.adapter.log.debug(`[REMOTE] ---- DISCONNECT ${message.sid}`);
                if (socket) {
                    this._removeSocket(message.sid);
                }
                // the client is gone and expects no answer
                promiseResult = Promise.resolve(NONE);
            }
            else if (name === 'getVersion') {
                promiseResult = Promise.resolve({
                    sid: message.sid,
                    d: [_type, id, name, [null, this.adminObj?.common.version, 'admin']],
                });
            }
            else if (name === 'subscribe' || name === 'subscribeStates') {
                const pattern = args[0];
                if (Array.isArray(pattern)) {
                    for (let p = 0; p < pattern.length; p++) {
                        this._subscribe(message.sid, 'stateChange', pattern[p]);
                    }
                }
                else {
                    this._subscribe(message.sid, 'stateChange', pattern);
                }
                this.adapter.log.level === 'debug' && this._showSubscribes(message.sid, 'stateChange');
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [null]] });
            }
            else if (name === 'unsubscribe' || name === 'unsubscribeStates') {
                const pattern = args[0];
                if (Array.isArray(pattern)) {
                    for (let p = 0; p < pattern.length; p++) {
                        this._unsubscribe(message.sid, 'stateChange', pattern[p]);
                    }
                }
                else {
                    this._unsubscribe(message.sid, 'stateChange', pattern);
                }
                this.adapter.log.level === 'debug' && this._showSubscribes(message.sid, 'stateChange');
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [null]] });
            }
            else if (name === 'subscribeObjects') {
                const pattern = args?.[0] || '*';
                if (Array.isArray(pattern)) {
                    for (let p = 0; p < pattern.length; p++) {
                        this._subscribe(message.sid, 'objectChange', pattern[p]);
                    }
                }
                else {
                    this._subscribe(message.sid, 'objectChange', pattern);
                }
                this.adapter.log.level === 'debug' && this._showSubscribes(message.sid, 'objectChange');
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [null]] });
            }
            else if (name === 'unsubscribeObjects') {
                const pattern = args[0];
                if (Array.isArray(pattern)) {
                    for (let p = 0; p < pattern.length; p++) {
                        this._unsubscribe(message.sid, 'objectChange', pattern[p]);
                    }
                }
                else {
                    this._unsubscribe(message.sid, 'objectChange', pattern);
                }
                this.adapter.log.level === 'debug' && this._showSubscribes(message.sid, 'objectChange');
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [null]] });
            }
            else if (name === 'authEnabled') {
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, [false, 'admin']] });
            }
            else if (name === 'readFile') {
                const adapter = args[0];
                const fileName = args[1];
                promiseResult = this.adapter
                    .readFileAsync(adapter, fileName)
                    .then(data => this._sendResponse(message.sid, _type, id, name, [null, data.file, data.mimeType], message.wu, message.ru))
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            else if (name === 'readFile64') {
                const adapter = args[0];
                const fileName = args[1];
                promiseResult = this.adapter
                    .readFileAsync(adapter, fileName)
                    .then(data => {
                    let data64;
                    if (data.file) {
                        try {
                            if (data.mimeType === 'application/json' ||
                                data.mimeType === 'application/json5' ||
                                fileName.toLowerCase().endsWith('.json5')) {
                                data64 = Buffer.from(encodeURIComponent(data.file.toString())).toString('base64');
                            }
                            else {
                                data64 = Buffer.isBuffer(data.file)
                                    ? data.file.toString('base64')
                                    : Buffer.from(data.file).toString('base64');
                            }
                        }
                        catch (error) {
                            this.adapter.log.error(`[readFile64] Cannot convert data: ${error.toString()}`);
                        }
                    }
                    return this._sendResponse(message.sid, _type, id, name, [null, data64, data.mimeType], message.wu, message.ru);
                })
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            else if (name === 'writeFile' || name === 'writeFile64') {
                const [adr, fileName, data64, options] = args;
                if (readUrl) {
                    promiseOne = (0, axios_1.default)(readUrl, {
                        responseType: 'arraybuffer',
                        validateStatus: status => status === 200,
                        timeout: 15000,
                    }).then(response => this.adapter.writeFileAsync(adr, fileName, Buffer.from(response.data), options));
                }
                else if (name === 'writeFile') {
                    this.adapter.log.debug('writeFile deprecated. Please use writeFile64');
                    promiseOne = this.adapter.writeFileAsync(adr, fileName, data64, options);
                }
                else if (name === 'writeFile64') {
                    const buffer = Buffer.from(data64, 'base64');
                    promiseOne = this.adapter.writeFileAsync(adr, fileName, buffer, options);
                }
            }
            else if (name === 'getHistory') {
                const _id = args[0];
                const options = args[1];
                promiseResult = this.adapter
                    .getHistoryAsync(_id, options)
                    .then(data => this._sendResponse(message.sid, _type, id, name, [null, data.result, data.step, data.sessionId], message.wu, message.ru))
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            else if (name === 'getEasyMode') {
                promiseOne = adminCommonSocket_1.default.getEasyMode(this.adapter, this.adminObj);
            }
            else if (name === 'getAdapterInstances') {
                promiseOne = adminCommonSocket_1.default.getAdapterInstances(this.adapter, args[0]);
            }
            else if (name === 'getCurrentInstance') {
                promiseOne = Promise.resolve(this.config.remoteAdminInstance);
            }
            else if (name === 'checkFeatureSupported') {
                promiseOne = Promise.resolve(this.adapter.supportsFeature?.(args[0]));
            }
            else if (name === 'getAdapterName') {
                promiseOne = Promise.resolve('admin');
            }
            else if (name === 'decrypt') {
                if (this.secret) {
                    promiseOne = Promise.resolve(this.adapter.decrypt(this.secret, args[0]));
                }
                else {
                    promiseOne = this.adapter.getForeignObjectAsync('system.config').then(obj => {
                        if (obj?.native?.secret) {
                            this.secret = obj.native.secret;
                            return this.adapter.decrypt(this.secret, args[0]);
                        }
                        this.adapter.log.error('No system.config found');
                        throw new Error('No system.config found');
                    });
                }
            }
            else if (name === 'encrypt') {
                if (this.secret) {
                    promiseOne = Promise.resolve(this.adapter.encrypt(this.secret, args[0]));
                }
                else {
                    promiseOne = this.adapter.getForeignObjectAsync('system.config').then(obj => {
                        if (obj?.native?.secret) {
                            this.secret = obj.native.secret;
                            return this.adapter.encrypt(this.secret, args[0]);
                        }
                        this.adapter.log.error('No system.config found');
                        throw new Error('No system.config found');
                    });
                }
            }
            else if (name === 'getIsEasyModeStrict') {
                promiseOne = adminCommonSocket_1.default.getIsEasyModeStrict(this.adapter, this.adminObj);
            }
            else if (name === 'getAdapters') {
                promiseOne = adminCommonSocket_1.default.getAdapters(this.adapter, args[0]);
            }
            else if (name === 'updateLicenses') {
                promiseOne = adminCommonSocket_1.default.updateLicenses(this.adapter, args[0], args[1], this.adminObj);
            }
            else if (name === 'getCompactInstances') {
                promiseOne = adminCommonSocket_1.default.getCompactInstances(this.adapter);
            }
            else if (name === 'getCompactSystemRepositories') {
                promiseOne = adminCommonSocket_1.default.getCompactSystemRepositories(this.adapter);
            }
            else if (name === 'getCompactAdapters') {
                promiseOne = adminCommonSocket_1.default.getCompactAdapters(this.adapter);
            }
            else if (name === 'getCompactInstalled') {
                promiseResult = adminCommonSocket_1.default.getCompactInstalled(this.adapter, args[0] || this.adminObj?.common.host || this.adapter.common.host).then(data => this._sendResponse(message.sid, _type, id, name, [data], message.wu, message.ru));
            }
            else if (name === 'getCompactSystemConfig') {
                promiseOne = adminCommonSocket_1.default.getCompactSystemConfig(this.adapter);
            }
            else if (name === 'getCompactRepository') {
                promiseResult = adminCommonSocket_1.default.getCompactRepository(this.adapter, args[0] || this.adminObj?.common.host || this.adapter.common.host).then(data => this._sendResponse(message.sid, _type, id, name, [data], message.wu, message.ru));
            }
            else if (name === 'getCompactHosts') {
                promiseOne = adminCommonSocket_1.default.getCompactHosts(this.adapter);
            }
            else if (name === 'readLogs') {
                promiseOne = adminCommonSocket_1.default.readLogs(this.adapter, args[0] || this.adminObj?.common.host || this.adapter.common.host);
            }
            else if (name === 'eventsThreshold') {
                promiseOne = Promise.resolve(NONE);
            }
            else if (name === 'getRatings') {
                promiseOne = adminCommonSocket_1.default.getRatings(this.adapter, args[0], args[1]);
            }
            else if (name === 'getUserPermissions') {
                promiseOne = this._getUserPermissions();
            }
            else if (name === 'listPermissions') {
                promiseResult = adminCommonSocket_1.default.listPermissions(this.adapter)
                    .then(commandsPermissions => this._sendResponse(message.sid, _type, id, name, [commandsPermissions]))
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            else if (name === 'sendToHost') {
                const [host, command, msg] = args;
                this.adapter.log.debug(`[REMOTE] SEND_TO_HOST: ${command}`);
                // check if the host is alive
                promiseResult = adminCommonSocket_1.default.sendToHost(this.adapter, host, command, msg)
                    .then(data => this._sendResponse(message.sid, _type, id, name, [data], message.wu, message.ru))
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            else if (name === 'sendTo') {
                const [adapterInstance, command, msg] = args;
                promiseResult = adminCommonSocket_1.default.sendTo(this.adapter, adapterInstance, command, msg)
                    .then(data => this._sendResponse(message.sid, _type, id, name, [data], message.wu, message.ru))
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            else if (name === 'getAllObjects') {
                promiseOne = adminCommonSocket_1.default.getAllObjects(this.adapter);
            }
            // MESSAGE is the only one-way message and no answer is expected
            if (_type === MESSAGE_TYPES.MESSAGE || _type === MESSAGE_TYPES.COMBINED_MESSAGE) {
                promiseResult = promiseOne ? promiseOne.then(() => NONE) : Promise.resolve(NONE);
            }
            else if (!promiseResult && promiseOne) {
                promiseResult = promiseOne
                    .then(result => this._sendResponse(message.sid, _type, id, name, [null, result], message.wu, message.ru))
                    .catch(error => ({ sid: message.sid, d: [_type, id, name, [error]] }));
            }
            if (!promiseResult) {
                this.adapter.log.warn(`[REMOTE] Received unknown command: ${name}`);
                promiseResult = Promise.resolve({ sid: message.sid, d: [_type, id, name, ['Unknown command']] });
            }
            return promiseResult
                .catch((error) => {
                this.adapter.log.warn(`[REMOTE] Cannot process "${name}": ${normalizeError(error)}`);
                if (_type === MESSAGE_TYPES.MESSAGE || _type === MESSAGE_TYPES.COMBINED_MESSAGE) {
                    return NONE;
                }
                return { sid: message.sid, d: [_type, id, name, [normalizeError(error)]] };
            })
                .then(result => {
                if (result !== NONE && result.d && result.d[0] !== MESSAGE_TYPES.WAIT) {
                    // Error objects would be sent as {}
                    if (Array.isArray(result.d[3])) {
                        result.d[3] = result.d[3].map(normalizeError);
                    }
                    setImmediate(() => void this._sendEvent(result));
                }
                return NONE;
            });
        }
        return Promise.reject(new Error('Null message'));
    }
    /**
     * Permissions of the remote admin user.
     * The remote admin instance has no authentication, so like the local admin it uses its default user.
     */
    _getUserPermissions() {
        let user = this.adminObj?.native?.defaultUser || 'admin';
        if (!user.startsWith('system.user.')) {
            user = `system.user.${user}`;
        }
        // the types of js-controller do not know the permission type "users", but it is supported
        return this.adapter.calculatePermissionsAsync(user, adminCommonSocket_1.COMMANDS_PERMISSIONS);
    }
    /** Find the web instance, which hosts MCP running as extension of all web instances */
    async _findWebInstance() {
        if (this.config.remoteWebInstance) {
            return this.config.remoteWebInstance;
        }
        const view = await this.adapter.getObjectViewAsync('system', 'instance', {
            startkey: 'system.adapter.web.',
            endkey: 'system.adapter.web.香',
        });
        const row = view?.rows.find(item => item.value?.common?.enabled && !item.value.native?.auth);
        return row ? row.id.replace(/^system\.adapter\./, '') : '';
    }
    /** Get the URL of the MCP endpoint of the configured MCP instance */
    async _getMcpUrl() {
        const mcpInstance = this.config.remoteMcpInstance;
        if (!mcpInstance) {
            throw new Error('MCP instance is not configured');
        }
        const mcpObj = await this.adapter.getForeignObjectAsync(`system.adapter.${mcpInstance}`);
        if (!mcpObj?.native) {
            throw new Error(`MCP instance "${mcpInstance}" does not exist`);
        }
        if (!mcpObj.common?.enabled) {
            throw new Error(`MCP instance "${mcpInstance}" is not enabled`);
        }
        if (mcpObj.native.oauth) {
            throw new Error(`OAuth authentication of "${mcpInstance}" is enabled, which is not supported via remote access`);
        }
        let serverInstance = mcpInstance;
        let serverObj = mcpObj;
        if (mcpObj.native.webInstance) {
            // MCP runs as extension and uses the web server of the web instance
            serverInstance =
                mcpObj.native.webInstance === '*' ? await this._findWebInstance() : mcpObj.native.webInstance;
            const webObj = serverInstance
                ? (await this.adapter.getForeignObjectAsync(`system.adapter.${serverInstance}`))
                : null;
            if (!webObj?.native) {
                throw new Error(`Web instance "${serverInstance || '*'}" of MCP instance "${mcpInstance}" does not exist`);
            }
            if (!webObj.common?.enabled) {
                throw new Error(`Web instance "${serverInstance}" of MCP instance "${mcpInstance}" is not enabled`);
            }
            serverObj = webObj;
        }
        // the remote access has no credentials for the local server
        if (serverObj.native.auth) {
            throw new Error(`The authentication of "${serverInstance}" is enabled, which is not supported via remote access`);
        }
        const url = await this._getInstanceUrl(serverObj);
        if (!url) {
            throw new Error(`The address of the host "${serverObj.common.host}" of "${serverInstance}" is unknown`);
        }
        return `${url}/mcp`;
    }
    /**
     * Forward one request of the MCP Streamable HTTP transport to the local MCP server.
     * Only request/response pairs can be forwarded: the server-to-client SSE stream (GET) is answered with 405,
     * which tells the MCP client that the server does not offer this stream.
     */
    async _mcpRequest(request) {
        const url = await this._getMcpUrl();
        const method = (request?.method || 'POST').toUpperCase();
        if (method !== 'POST' && method !== 'DELETE') {
            return { status: 405, headers: { allow: 'POST, DELETE' }, body: '' };
        }
        const headers = {};
        if (request?.headers && typeof request.headers === 'object') {
            for (const [headerName, value] of Object.entries(request.headers)) {
                if (typeof value === 'string' && MCP_REQUEST_HEADERS.includes(headerName.toLowerCase())) {
                    headers[headerName.toLowerCase()] = value;
                }
            }
        }
        let data;
        if (method === 'POST') {
            // the MCP transport rejects requests, which do not accept both formats
            headers.accept ||= 'application/json, text/event-stream';
            headers['content-type'] ||= 'application/json';
            data = typeof request?.body === 'string' ? request.body : JSON.stringify(request?.body ?? null);
        }
        const response = await axios_1.default.request({
            url,
            method,
            headers,
            data,
            responseType: 'text',
            // keep the body as it is (JSON or text/event-stream)
            transformResponse: [(body) => body],
            validateStatus: () => true,
            maxRedirects: 0,
            timeout: MCP_TIMEOUT_MS,
            httpsAgent: localHttpsAgent,
        });
        const responseHeaders = {};
        for (const headerName of MCP_RESPONSE_HEADERS) {
            const value = response.headers[headerName];
            if (value !== undefined && value !== null) {
                responseHeaders[headerName] = String(value);
            }
        }
        const body = typeof response.data === 'string' ? response.data : '';
        let status = response.status;
        // @iobroker/mcp-server answers requests of a session, which it does not know (anymore), with 400,
        // e.g. after a restart of the MCP instance. MCP clients start a new session only on 404
        // (Streamable HTTP specification), otherwise every further request of the client fails.
        if (headers['mcp-session-id'] && status === 400 && /session ID/i.test(body)) {
            this.adapter.log.info(`[REMOTE] MCP session "${headers['mcp-session-id']}" is unknown to the MCP instance (restarted?), the client must reconnect`);
            status = 404;
        }
        return { status, headers: responseHeaders, body };
    }
}
exports.default = RemoteAccess;
//# sourceMappingURL=remote.js.map