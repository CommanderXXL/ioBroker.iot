"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const Utils_1 = require("../Helpers/Utils");
const AdapterProvider_1 = __importDefault(require("../Helpers/AdapterProvider"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const Brightness_1 = __importDefault(require("../Alexa/Properties/Brightness"));
const ColorTemperatureInKelvin_1 = __importDefault(require("../Alexa/Properties/ColorTemperatureInKelvin"));
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
const Color_1 = __importDefault(require("../Alexa/Properties/Color"));
// ### RGB Light Single [rgbSingle]
//
// RGB light with one state of color. Could be HEX #RRGGBB, or rgb(0-255,0-255,0-255).
//
// | R | Name            | Role                          | Unit | Type    | Wr | Ind | Multi | Regex                                             |
// |---|-----------------|-------------------------------|------|---------|----|-----|-------|---------------------------------------------------|
// | * | RGB             | level.color.rgb               |      | string  | W  |     |       | `/^level\.color\.rgb$/`                           |
// |   | DIMMER          | level.dimmer                  | %    | number  | W  |     |       | `/^level\.dimmer$/`                               |
// |   | BRIGHTNESS      |                               | %    | number  | W  |     |       | `/^level\.brightness$/`                           |
// |   | TEMPERATURE     | level.color.temperature       | °K   | number  | W  |     |       | `/^level\.color\.temperature$/`                   |
// |   | ON              | switch.light                  |      | boolean | W  |     |       | `/^switch(\.light)?$/`                            |
// |   | ON_ACTUAL       | sensor.light                  |      | boolean | -  |     |       | `/^(state｜switch｜sensor)\.light｜switch$/`         |
class RgbSingle extends AdjustableControl_1.default {
    _brightnessCapability;
    _brightness;
    _colorTemperatureCapability;
    _offValue = 0;
    constructor(detectedControl) {
        super(detectedControl);
        const map = this.statesMap;
        this._supported = [new Capabilities_1.default.ColorController(this.composeInitObjectColor())];
        if (this.states[map.temperature]) {
            this._colorTemperatureCapability = new Capabilities_1.default.ColorTemperatureController(this.composeInitObjectColorTemperature());
            this._supported.push(this._colorTemperatureCapability);
        }
        // if the state DIMMER or BRIGHTNESS configured
        if (this.states[map.dimmer] || this.states[map.brightness]) {
            this._brightnessCapability = new Capabilities_1.default.BrightnessController(this.composeInitObjectBrightness());
            this._brightness = this._brightnessCapability.brightness;
            this._supported.push(this._brightnessCapability);
        }
        // if the state ON, DIMMER or BRIGHTNESS configured
        if (this.states[map.on] || this._brightness) {
            if (!this.states[map.on]) {
                this._offValue = (0, Utils_1.denormalize_0_100)(AdapterProvider_1.default.deviceOffLevel(), this._brightness.valuesRangeMin, this._brightness.valuesRangeMax || 100);
            }
            this._supported.push(new Capabilities_1.default.PowerController(this.composeInitObjectPowerState()));
        }
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['LIGHT'];
    }
    adjustableProperties() {
        return [ColorTemperatureInKelvin_1.default];
    }
    async getOrRetrieveCurrentValue(property) {
        const map = this.statesMap;
        if (property.currentValue === undefined) {
            property.currentValue = await AdapterProvider_1.default.getState(property.getId);
            // convert the non-zero brightness to power = true
            if (property.propertyName === PowerState_1.default.propertyName && !this.states[map.on]) {
                property.currentValue = property.currentValue > this._offValue;
            }
        }
        if (property.currentValue === undefined) {
            throw new Error(`unable to retrieve ${property.getId}`);
        }
        return property.currentValue;
    }
    async setState(property, value) {
        if (property.propertyName === PowerState_1.default.propertyName) {
            if (this.states[this.statesMap.on]) {
                await AdapterProvider_1.default.setState(property.setId, value ?? false);
                property.currentValue = value;
            }
            else {
                // this will be processed in Brightness property
            }
        }
        else if (property.propertyName === Color_1.default.propertyName) {
            await AdapterProvider_1.default.setState(property.setId, value ?? '#000000');
            property.currentValue = value;
        }
        else if (property.propertyName === Brightness_1.default.propertyName ||
            property.propertyName === ColorTemperatureInKelvin_1.default.propertyName) {
            await AdapterProvider_1.default.setState(property.setId, value);
            property.currentValue = value;
        }
    }
    async adjustValue(event, property) {
        // extract Alexa delta value from event
        const delta = property.alexaDirectiveValue(event);
        // convert delta to iobroker value
        const value = property.value(delta);
        // set iobroker state
        await this.setState(property, value ?? 0);
        return value;
    }
    composeInitObjectColor() {
        const map = this.statesMap;
        return {
            setState: this.states[map.rgb],
            getState: this.states[map.rgb],
            rgb: this.states[map.rgb],
        };
    }
    composeInitObjectPowerState() {
        const map = this.statesMap;
        return {
            setState: this.states[map.on] || this.states[map.dimmer] || this.states[map.brightness],
            getState: this.states[map.on_actual] ||
                this.states[map.on] ||
                this.states[map.dimmer] ||
                this.states[map.brightness],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
            multiPurposeProperty: !this.states[map.on],
            handleSimilarEvents: true, // If brightness set to non-zero value and power is off, turn the lamp on
        };
    }
    composeInitObjectBrightness() {
        const map = this.statesMap;
        let onValue = undefined;
        const offValue = AdapterProvider_1.default.deviceOffLevel();
        if (this.smartName && typeof this.smartName === 'object') {
            const byOn = this.smartName.byON;
            if (byOn !== null && byOn !== undefined && !isNaN(byOn)) {
                onValue = parseFloat(byOn);
                if (onValue < offValue) {
                    onValue = offValue;
                }
            }
            else if (byOn === 'stored' || byOn === 'omit') {
                onValue = byOn;
            }
        }
        return {
            setState: this.states[map.dimmer] || this.states[map.brightness],
            getState: this.states[map.dimmer] || this.states[map.brightness],
            alexaSetter: function (alexaValue) {
                return ((0, Utils_1.denormalize_0_100)(alexaValue, this.valuesRangeMin, this.valuesRangeMax) ?? 0);
            },
            alexaGetter: function (value) {
                return (0, Utils_1.normalize_0_100)(value, this.valuesRangeMin, this.valuesRangeMax);
            },
            multiPurposeProperty: !this.states[map.on], // Could handle powerState events
            handleSimilarEvents: true, // If power set ON and brightness is 0, set to non-zero value
            offValue,
            onValue,
            percentage: true,
        };
    }
    composeInitObjectColorTemperature() {
        const map = this.statesMap;
        const isMireds = this.states[map.temperature]?.common?.unit === 'mireds';
        return {
            setState: this.states[map.temperature],
            getState: this.states[map.temperature],
            alexaSetter: function (alexaValue) {
                if (alexaValue === 1) {
                    // increase directive
                    const closest = (0, Utils_1.closestFromList)(this.currentValue || this.colorTemperatureTable[0], this.colorTemperatureTable);
                    let index = this.colorTemperatureTable.indexOf(closest) + 1;
                    index = index >= this.colorTemperatureTable.length ? this.colorTemperatureTable.length - 1 : index;
                    return this.colorTemperatureTable[index];
                }
                if (alexaValue === -1) {
                    // decrease directive
                    const closest = (0, Utils_1.closestFromList)(this.currentValue || this.colorTemperatureTable[0], this.colorTemperatureTable);
                    let index = this.colorTemperatureTable.indexOf(closest) - 1;
                    index = index < 0 ? 0 : index;
                    return this.colorTemperatureTable[index];
                }
                // Convert Kelvin to mireds
                if (isMireds) {
                    return Math.round(1000000 / alexaValue);
                }
                return alexaValue;
            },
            alexaGetter: function (value) {
                // Convert Mireds to Kelvin
                if (isMireds) {
                    return Math.round(1000000 / value);
                }
                return value;
            },
        };
    }
}
exports.default = RgbSingle;
//# sourceMappingURL=RgbSingle.js.map