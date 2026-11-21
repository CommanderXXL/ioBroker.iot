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
const Color_1 = __importDefault(require("../Alexa/Properties/Color"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
// ### RGB(W) Light with different states for every color [rgb]
//
// R,G,B(,W) Light with different states for every color. The value is from 0 to 255.
//
// | R | Name            | Role                          | Unit | Type    | Wr | Ind | Multi | Regex                                             |
// |---|-----------------|-------------------------------|------|---------|----|-----|-------|---------------------------------------------------|
// | * | RED             | level.color.red               |      | number  | W  |     |       | `/^level\.color\.red$/`                           |
// | * | GREEN           | level.color.green             |      | number  | W  |     |       | `/^level\.color\.green$/`                         |
// | * | BLUE            | level.color.blue              |      | number  | W  |     |       | `/^level\.color\.blue$/`                          |
// |   | WHITE           | level.color.white             |      | number  | W  |     |       | `/^level\.color\.white$/`                         |
// |   | DIMMER          | level.dimmer                  | %    | number  | W  |     |       | `/^level\.dimmer$/`                               |
// |   | BRIGHTNESS      |                               |      | number  | W  |     |       | `/^level\.brightness$/`                           |
// |   | TEMPERATURE     | level.color.temperature       | °K   | number  | W  |     |       | `/^level\.color\.temperature$/`                   |
// |   | ON              | switch.light                  |      | boolean | W  |     |       | `/^switch(\.light)?$｜^state$/`                    |
// |   | ON_ACTUAL       | sensor.light                  |      | boolean | -  |     |       | `/^(state｜switch｜sensor)\.light｜switch$/`         |
class Rgb extends AdjustableControl_1.default {
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
        if (property.propertyName === Color_1.default.propertyName) {
            // read every time all colors
            const red = await AdapterProvider_1.default.getState(this.states[map.red].id);
            const green = await AdapterProvider_1.default.getState(this.states[map.green].id);
            const blue = await AdapterProvider_1.default.getState(this.states[map.blue].id);
            let white;
            if (this.states[map.white]) {
                white = await AdapterProvider_1.default.getState(this.states[map.white].id);
            }
            const minMaxRed = (0, Utils_1.configuredRangeOrDefault)(this.states[map.red]);
            const minMaxGreen = (0, Utils_1.configuredRangeOrDefault)(this.states[map.green]);
            const minMaxBlue = (0, Utils_1.configuredRangeOrDefault)(this.states[map.blue]);
            let minMaxWhite;
            if (this.states[map.white]) {
                minMaxWhite = (0, Utils_1.configuredRangeOrDefault)(this.states[map.white]);
            }
            // normalize values to 0-255
            const redNorm = (0, Utils_1.normalize_0_100)(red, minMaxRed.min, minMaxRed.max, true);
            const greenNorm = (0, Utils_1.normalize_0_100)(green, minMaxGreen.min, minMaxGreen.max, true);
            const blueNorm = (0, Utils_1.normalize_0_100)(blue, minMaxBlue.min, minMaxBlue.max, true);
            let whiteNorm;
            if (this.states[map.white]) {
                whiteNorm = (0, Utils_1.normalize_0_100)(white, minMaxWhite.min, minMaxWhite.max, true);
            }
            const red255 = Math.round(redNorm * 2.55);
            const green255 = Math.round(greenNorm * 2.55);
            const blue255 = Math.round(blueNorm * 2.55);
            let white255;
            if (this.states[map.white]) {
                white255 = Math.round(whiteNorm * 2.55);
            }
            // Convert to HEX
            let hex = `#${red255.toString(16).padStart(2, '0')}${green255.toString(16).padStart(2, '0')}${blue255.toString(16).padStart(2, '0')}`;
            if (this.states[map.white]) {
                hex += white255.toString(16).padStart(2, '0');
            }
            // store current value
            property.currentValue = hex.toLowerCase();
            return property.currentValue;
        }
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
        const map = this.statesMap;
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
            // Split value into RGB(W)
            const hex = value.replace('#', '');
            const red = parseInt(hex.substring(0, 2), 16);
            const green = parseInt(hex.substring(2, 4), 16);
            const blue = parseInt(hex.substring(4, 6), 16);
            // let white: number | undefined;
            // if (hex.length === 8) {
            //     white = parseInt(hex.substring(6, 8), 16);
            // }
            // Convert from 0-255 to 0-100
            const red100 = (red / 255) * 100;
            const green100 = (green / 255) * 100;
            const blue100 = (blue / 255) * 100;
            // let white100: number | undefined;
            // if (white !== undefined) {
            //     white100 = (white / 255) * 100;
            // }
            // Convert from 0-100 to min-max of the state
            const minMaxRed = (0, Utils_1.configuredRangeOrDefault)(this.states[map.red]);
            const minMaxGreen = (0, Utils_1.configuredRangeOrDefault)(this.states[map.green]);
            const minMaxBlue = (0, Utils_1.configuredRangeOrDefault)(this.states[map.blue]);
            // let minMaxWhite: { min: number | boolean; max: number | boolean } | undefined;
            // if (this.states[map.white]) {
            //     minMaxWhite = configuredRangeOrDefault(this.states[map.white]!);
            // }
            const redValue = (0, Utils_1.denormalize_0_100)(red100, minMaxRed.min, minMaxRed.max);
            const greenValue = (0, Utils_1.denormalize_0_100)(green100, minMaxGreen.min, minMaxGreen.max);
            const blueValue = (0, Utils_1.denormalize_0_100)(blue100, minMaxBlue.min, minMaxBlue.max);
            // let whiteValue: number | undefined;
            // if (this.states[map.white]) {
            //     whiteValue = denormalize_0_100(white100!, minMaxWhite!.min as number, minMaxWhite!.max as number);
            // }
            // set states
            await Promise.all([
                AdapterProvider_1.default.setState(this.states[map.red].id, redValue ?? 0),
                AdapterProvider_1.default.setState(this.states[map.green].id, greenValue ?? 0),
                AdapterProvider_1.default.setState(this.states[map.blue].id, blueValue ?? 0),
                // this.states[map.white] ? AdapterProvider.setState(this.states[map.white]!.id, whiteValue ?? 0) : null,
            ]);
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
        // Set default min max to 0 255 for colors
        ['red', 'green', 'blue', 'white'].forEach(color => {
            if (this.states[map[color]] && this.states[map[color]].common?.min === undefined) {
                this.states[map[color]].common ||= {};
                this.states[map[color]].common.min = 0;
            }
            if (this.states[map[color]] && this.states[map[color]].common?.max === undefined) {
                this.states[map[color]].common ||= {};
                this.states[map[color]].common.max = 255;
            }
        });
        if (this.states[map.white]) {
            return {
                rgbw: {
                    red: this.states[map.red],
                    green: this.states[map.green],
                    blue: this.states[map.blue],
                    white: this.states[map.white],
                },
            };
        }
        return {
            rgb: {
                red: this.states[map.red],
                green: this.states[map.green],
                blue: this.states[map.blue],
            },
        };
    }
    composeInitObjectPowerState() {
        const map = this.statesMap;
        return {
            setState: this.states[map.on] || this.states[map.dimmer] || this.states[map.brightness],
            getState: this.states[map.on] ||
                this.states[map.on_actual] ||
                this.states[map.dimmer] ||
                this.states[map.brightness],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
            multiPurposeProperty: !this.states[map.on], // Could handle brightness events
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
exports.default = Rgb;
//# sourceMappingURL=Rgb.js.map