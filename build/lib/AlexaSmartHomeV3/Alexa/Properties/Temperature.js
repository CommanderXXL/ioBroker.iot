"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
class Temperature extends Base_1.default {
    static matches(event) {
        return event?.directive?.header?.namespace === 'Alexa.TemperatureSensor';
    }
    matches(event) {
        return Temperature.matches(event);
    }
    get scale() {
        const unit = this.getSetState()?.common?.unit?.trim().toUpperCase();
        if (unit === '°F' || unit === 'F' || unit === 'FAHRENHEIT') {
            return 'FAHRENHEIT';
        }
        return 'CELSIUS';
    }
    reportValue(value) {
        return {
            value,
            scale: this.scale,
        };
    }
}
exports.default = Temperature;
//# sourceMappingURL=Temperature.js.map