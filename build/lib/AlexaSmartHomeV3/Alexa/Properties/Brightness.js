"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AdjustableProperty_1 = __importDefault(require("./AdjustableProperty"));
class Brightness extends AdjustableProperty_1.default {
    #valueOn = null;
    matches(event) {
        if (Brightness.matches(event)) {
            return true;
        }
        return ((this._multiPurposeProperty || this._handleSimilarEvents) &&
            event?.directive?.header?.namespace === 'Alexa.PowerController');
    }
    alexaDirectiveValue(event) {
        if (event?.directive?.header?.namespace === 'Alexa.PowerController') {
            if (event?.directive?.header.name === 'TurnOn') {
                if (
                // If we have no dedicated power switch
                this._multiPurposeProperty ||
                    // Or current value is 0 and the lamp is turned ON
                    (this._handleSimilarEvents &&
                        (typeof this._onValueInPercent === 'number' ||
                            this.currentValue === undefined ||
                            this.currentValue === null ||
                            this.currentValue <= this.valuesRangeMin))) {
                    // Assume full brightness on TurnOn
                    // set byOn to the configured value or 100 otherwise
                    if (this._onValueInPercent !== undefined) {
                        if (this._onValueInPercent === 'stored') {
                            this.#valueOn ||= 100;
                        }
                        else if (this._onValueInPercent === 'omit') {
                            // Do not change brightness on TurnOn
                            return undefined;
                        }
                        else {
                            this.#valueOn = this._onValueInPercent;
                        }
                        return this.#valueOn < this._offValue ? 100 : this.#valueOn;
                    }
                    if (this.#valueOn && this.#valueOn > this._offValue) {
                        return this.#valueOn;
                    }
                    return 100;
                }
            }
            else if (event?.directive?.header.name === 'TurnOff') {
                // If we have a dedicated power state, we do not change brightness on TurnOff
                if (this._multiPurposeProperty) {
                    // Assume zero brightness on TurnOff if we do not have a dedicated power state
                    return 0;
                }
            }
            return undefined;
        }
        if (Brightness.directive(event) === Brightness.SET) {
            const value = super.alexaDirectiveValue(event);
            // remember last brightness > 0
            if (value >= this._offValue) {
                this.#valueOn = value;
            }
            return value;
        }
        return event.directive.payload.brightnessDelta;
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
exports.default = Brightness;
//# sourceMappingURL=Brightness.js.map