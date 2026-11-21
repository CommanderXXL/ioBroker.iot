"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TemperatureSensor_1 = __importDefault(require("../Alexa/Capabilities/TemperatureSensor"));
const Control_1 = __importDefault(require("./Control"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
const HumiditySensor_1 = __importDefault(require("../Alexa/Capabilities/HumiditySensor"));
class Temperature extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        // Sensor devices must also implement Alexa.EndpointHealth.
        this._supported = [new TemperatureSensor_1.default(this.blankInitObject())];
        const initObj = this.humidityInitObject();
        if (initObj) {
            this._supported.push(new HumiditySensor_1.default(initObj));
        }
        this._supported.push(new EndpointHealth_1.default(this.connectivityInitObject(true)));
    }
    get categories() {
        return ['TEMPERATURE_SENSOR'];
    }
    humidityInitObject() {
        const map = this.statesMap;
        if (!this.states[map.second]) {
            return null;
        }
        return {
            getState: this.states[map.second],
            setState: this.states[map.second],
        };
    }
}
exports.default = Temperature;
//# sourceMappingURL=Temperature.js.map