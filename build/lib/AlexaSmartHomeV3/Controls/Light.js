"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const Control_1 = __importDefault(require("./Control"));
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
const Brightness_1 = __importDefault(require("../Alexa/Properties/Brightness"));
class Light extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        // We support dimmer as enforced capability to allow setting group commands to dim to 0% and to 100%
        // Init enforced capabilities
        const brightnessController = new Capabilities_1.default.BrightnessController(this.brightnessInitObject());
        this._enforced = [brightnessController];
        // Init capabilities
        const powerController = new Capabilities_1.default.PowerController(this.powerStateInitObject());
        this._supported = [powerController];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['LIGHT'];
    }
    adjustableProperties() {
        return [Brightness_1.default];
    }
    get statesMap() {
        return {
            set: 'SET',
            actual: 'ON_ACTUAL',
        };
    }
    powerStateInitObject() {
        // const states = this.initStates(ctrl);
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
            multiPurposeProperty: true,
        };
    }
    brightnessInitObject() {
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual],
            alexaSetter: function (alexaValue) {
                return alexaValue > 0;
            },
            alexaGetter: function (value) {
                return value ? 100 : 0;
            },
        };
    }
}
exports.default = Light;
//# sourceMappingURL=Light.js.map