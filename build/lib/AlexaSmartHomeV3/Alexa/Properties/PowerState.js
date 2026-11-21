"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
class PowerState extends Base_1.default {
    matches(event) {
        const namespace = event?.directive?.header?.namespace;
        const eventName = event?.directive?.header?.name || '';
        return (namespace === 'Alexa.PowerController' ||
            ((this._multiPurposeProperty || this._handleSimilarEvents) &&
                namespace === 'Alexa.PercentageController' &&
                !eventName.includes('Adjust')) ||
            ((this._multiPurposeProperty || this._handleSimilarEvents) &&
                namespace === 'Alexa.BrightnessController' &&
                !eventName.includes('Adjust')));
    }
    static get ON() {
        return 'ON';
    }
    static get OFF() {
        return 'OFF';
    }
    alexaDirectiveValue(event) {
        // Case when we are in dimmer or rgb lamp, and it does not have a dedicated power switch
        if (this._multiPurposeProperty &&
            !this._handleSimilarEvents &&
            event.directive.header.namespace === 'Alexa.PercentageController') {
            const percentage = event.directive.payload.percentage;
            if (percentage) {
                return PowerState.ON;
            }
            return PowerState.OFF;
        }
        if (this._handleSimilarEvents && event.directive.header.namespace === 'Alexa.PercentageController') {
            const percentage = event.directive.payload.percentage;
            if (percentage && !this.currentValue) {
                return PowerState.ON;
            }
            return undefined;
        }
        // Case when we are in dimmer or rgb lamp, and it does not have a dedicated power switch
        if (this._multiPurposeProperty &&
            !this._handleSimilarEvents &&
            event.directive.header.namespace === 'Alexa.BrightnessController') {
            const brightness = event.directive.payload.brightness;
            if (brightness) {
                return PowerState.ON;
            }
            return PowerState.OFF;
        }
        // Case when we are in dimmer or rgb lamp, and it the device has a dedicated power switch
        if (this._handleSimilarEvents && event.directive.header.namespace === 'Alexa.BrightnessController') {
            const brightness = event.directive.payload.brightness;
            if (brightness && !this.currentValue) {
                return PowerState.ON;
            }
            return undefined;
        }
        return event.directive.header.name === 'TurnOn' ? PowerState.ON : PowerState.OFF;
    }
    alexaValue(value) {
        if (this._stateType === 'number') {
            const min = this.valuesRangeMin;
            // In this case, it is important if max is set or not
            const max = this.valueRealMax;
            if (min === undefined || max === undefined) {
                return value > 0 ? PowerState.ON : PowerState.OFF;
            }
            const mid = min + (max - min) / 2;
            if (value >= mid) {
                return PowerState.ON;
            }
            return PowerState.OFF;
        }
        return value === true ? PowerState.ON : value === false ? PowerState.OFF : undefined;
    }
    value(alexaValue) {
        if (this._stateType === 'number') {
            const min = this.valuesRangeMin;
            const max = this.valueRealMax;
            if (min === undefined || max === undefined) {
                return alexaValue === PowerState.ON ? 1 : alexaValue === PowerState.OFF ? 0 : undefined;
            }
            return alexaValue === PowerState.ON ? max : alexaValue === PowerState.OFF ? min : undefined;
        }
        return alexaValue === PowerState.ON ? true : alexaValue === PowerState.OFF ? false : undefined;
    }
}
exports.default = PowerState;
//# sourceMappingURL=PowerState.js.map