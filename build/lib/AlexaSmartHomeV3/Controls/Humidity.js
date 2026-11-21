"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const HumiditySensor_1 = __importDefault(require("../Alexa/Capabilities/HumiditySensor"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
const Control_1 = __importDefault(require("./Control"));
class Humidity extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        // Sensor devices must also implement Alexa.EndpointHealth.
        this._supported = [
            new HumiditySensor_1.default(this.blankInitObject()),
            new EndpointHealth_1.default(this.connectivityInitObject(true)),
        ];
    }
    get categories() {
        return ['TEMPERATURE_SENSOR'];
    }
}
exports.default = Humidity;
//# sourceMappingURL=Humidity.js.map