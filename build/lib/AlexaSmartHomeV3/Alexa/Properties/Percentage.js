"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AdjustableProperty_1 = __importDefault(require("./AdjustableProperty"));
class Percentage extends AdjustableProperty_1.default {
    matches(event) {
        return Percentage.matches(event);
    }
    alexaDirectiveValue(event) {
        return Percentage.directive(event) === Percentage.SET
            ? super.alexaDirectiveValue(event)
            : event.directive.payload.percentageDelta;
    }
    /** Converts an Alexa value to an ioBroker value */
    value(alexaValue) {
        // Convert alexa value 0-100 to ioBroker value min-max
        if (typeof alexaValue === 'number') {
            const value = this.valueRealMin +
                ((this.valueRealMax - this.valueRealMin) * alexaValue) / 100;
            return Math.round(value);
        }
        return undefined;
    }
    /** Converts an ioBroker value to an Alexa value */
    alexaValue(value) {
        // Convert ioBroker Value min-max to Alexa value 0-100
        if (typeof value === 'number') {
            const alexaValue = ((value - this.valueRealMin) * 100) /
                (this.valueRealMax - this.valueRealMin);
            return Math.round(alexaValue);
        }
        return undefined;
    }
}
exports.default = Percentage;
//# sourceMappingURL=Percentage.js.map