"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ThermostatMode_1 = __importDefault(require("../Properties/ThermostatMode"));
const TargetSetpoint_1 = __importDefault(require("../Properties/TargetSetpoint"));
const Base_1 = __importDefault(require("./Base"));
class ThermostatController extends Base_1.default {
    _thermostatMode;
    constructor(setPointOpts, modeOpts) {
        super();
        this._thermostatMode = new ThermostatMode_1.default(modeOpts);
        this._properties = [new TargetSetpoint_1.default(setPointOpts), this._thermostatMode];
    }
    get version() {
        return '3.2';
    }
    get thermostatMode() {
        return this._thermostatMode;
    }
    get alexaResponse() {
        return {
            interface: this.namespace,
            version: this.version,
            properties: this.discoverableProperties,
            configuration: this.configuration,
        };
    }
    get configuration() {
        // The position of a mode is its value in ioBroker, so the list has gaps for values without an Alexa mode,
        // e.g. {0: AUTO, 1: MANU, 2: ECO}. Alexa must get every mode once and no null.
        const modes = [...new Set((this._thermostatMode?.supportedModes || []).filter(mode => mode))];
        return {
            ordered: false,
            supportedModes: modes.length ? modes : ['AUTO'],
        };
    }
}
exports.default = ThermostatController;
//# sourceMappingURL=ThermostatController.js.map