"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const Properties_1 = __importDefault(require("../Alexa/Properties"));
const Control_1 = __importDefault(require("./Control"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Lock extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        const lockController = new Capabilities_1.default.LockController(this.lockStateInitObject());
        this._supported = [lockController, new EndpointHealth_1.default(this.connectivityInitObject(true))];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['SMARTLOCK'];
    }
    lockStateInitObject() {
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual],
            alexaSetter: function (alexaValue) {
                return alexaValue === Properties_1.default.LockState.UNLOCK;
            },
            alexaGetter: function (value) {
                return value ? Properties_1.default.LockState.UNLOCKED : Properties_1.default.LockState.LOCKED;
            },
        };
    }
}
exports.default = Lock;
//# sourceMappingURL=Lock.js.map