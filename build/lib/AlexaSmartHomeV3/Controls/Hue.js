"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const Utils_1 = require("../Helpers/Utils");
const Properties_1 = __importDefault(require("../Alexa/Properties"));
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const Brightness_1 = __importDefault(require("../Alexa/Properties/Brightness"));
const AdapterProvider_1 = __importDefault(require("../Helpers/AdapterProvider"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const Color_1 = __importDefault(require("../Alexa/Properties/Color"));
const ColorTemperatureInKelvin_1 = __importDefault(require("../Alexa/Properties/ColorTemperatureInKelvin"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Hue extends AdjustableControl_1.default {
    _brightnessCapability;
    _brightness;
    _colorTemperatureCapability;
    _offValue = 0;
    constructor(detectedControl) {
        super(detectedControl);
        const map = this.statesMap;
        this._supported = [new Capabilities_1.default.ColorController(this.composeInitObjectColor())];
        // if the state DIMMER or BRIGHTNESS configured
        if (this.states[map.dimmer] || this.states[map.brightness]) {
            this._brightnessCapability = new Capabilities_1.default.BrightnessController(this.composeInitObjectBrightness());
            this._brightness = this._brightnessCapability.brightness;
            this._supported.push(this._brightnessCapability);
        }
        // if the state TEMPERATURE configured
        if (this.states[map.temperature]) {
            this._colorTemperatureCapability = new Capabilities_1.default.ColorTemperatureController(this.composeInitObjectColorTemperature());
            this._supported.push(this._colorTemperatureCapability);
        }
        // if the state ON, DIMMER or BRIGHTNESS configured
        if (this.states[map.on] || this._brightness) {
            if (!this.states[map.on]) {
                this._offValue = (0, Utils_1.denormalize_0_1)(AdapterProvider_1.default.deviceOffLevel(), this._brightness.valuesRangeMin, this._brightness.valuesRangeMax || 100);
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
        return [Properties_1.default.ColorTemperatureInKelvin];
    }
    /** Value of a state as 0..1, as Alexa expects it for saturation and brightness. Without a valid value: 1 */
    static toRange_0_1(value, min, max) {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (!Number.isFinite(num) || !(min < max)) {
            return 1;
        }
        return (0, Utils_1.normalize_0_1)((0, Utils_1.ensureValueInRange)(num, min, max), min, max) ?? 1;
    }
    async getOrRetrieveCurrentValue(property) {
        const map = this.statesMap;
        if (property.currentValue === undefined) {
            property.currentValue = await AdapterProvider_1.default.getState(property.getId);
            // convert the non-zero brightness to power = true
            if (property.propertyName === Properties_1.default.PowerState.propertyName && !this.states[map.on]) {
                property.currentValue = property.currentValue > this._offValue;
            }
            if (property.propertyName === Properties_1.default.Color.propertyName) {
                // convert to HAL object: Alexa rejects a saturation or brightness outside 0..1
                let saturation = 1;
                let brightness = 1;
                if (property.hal.brightness && this._brightness) {
                    brightness = Hue.toRange_0_1(await AdapterProvider_1.default.getState(property.hal.brightness), this._brightness.valuesRangeMin, this._brightness.valuesRangeMax);
                }
                if (property.hal.saturation && this.states[map.saturation]) {
                    saturation = Hue.toRange_0_1(await AdapterProvider_1.default.getState(property.hal.saturation), this.states[map.saturation].common.min || 0, this.states[map.saturation].common.max || 100);
                }
                // @ts-expect-error special case for Hue property
                property.currentValue = {
                    hue: property.currentValue,
                    saturation,
                    brightness,
                };
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
        else if (property.propertyName === Brightness_1.default.propertyName) {
            await AdapterProvider_1.default.setState(property.setId, value ?? 0);
            property.currentValue = value;
        }
        else if (property.propertyName === Color_1.default.propertyName) {
            const colorProperty = property;
            const hueValue = (0, Utils_1.rgb2hal)(value);
            await AdapterProvider_1.default.setState(colorProperty.hal.hue, hueValue.hue);
            const map = this.statesMap;
            if (colorProperty.hal.saturation) {
                // The saturation is from 0 to 1 in Alexa, but from 0 to 100 in ioBroker
                const iobValue = (0, Utils_1.denormalize_0_1)(hueValue.saturation, this.states[map.saturation].common.min || 0, this.states[map.saturation].common.max || 100);
                await AdapterProvider_1.default.setState(colorProperty.hal.saturation, iobValue);
            }
            // do not set brightness
            // if (colorProperty.hal!.brightness) {
            //     // The brightness is from 0 to 1 in Alexa, but from 0 to 100 in ioBroker
            //     const iobValue = denormalize_0_1(
            //         hueValue.brightness,
            //         this.states[map.brightness]!.common.min || 0,
            //         this.states[map.brightness]!.common.max || 100,
            //     ) as number;
            //     await AdapterProvider.setState(colorProperty.hal!.brightness, iobValue);
            // }
            // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-colorcontroller.html
            // Important: For the best user experience, when you make a color change, maintain the current brightness setting of the endpoint.
            // For example, if a light bulb is currently set to white at 0.5 brightness, and a user requests a color change to red,
            // the SetColor directive specifies hue = 0, saturation = 1, and brightness = 1. Here, set the hue to 0, the saturation to 1,
            // and ignore the brightness value of 1 in the directive. Instead, maintain the current brightness value of 0.5.
            property.currentValue = value;
        }
        else if (property.propertyName === ColorTemperatureInKelvin_1.default.propertyName) {
            await AdapterProvider_1.default.setState(property.setId, value ?? 2200);
            property.currentValue = value;
        }
    }
    async adjustValue(event, property) {
        // extract Alexa delta value from event
        const delta = property.alexaDirectiveValue(event);
        // convert delta to iobroker value
        const value = property.value(delta);
        // set iobroker state
        await this.setState(property, value);
        return value;
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
                const ioBrokerValue = (0, Utils_1.denormalize_0_100)(alexaValue, this.valuesRangeMin, this.valuesRangeMax) ?? 0;
                console.log('Alexa Setter Brightness:', alexaValue, '->', ioBrokerValue);
                return ioBrokerValue;
            },
            alexaGetter: function (value) {
                const alexaValue = (0, Utils_1.normalize_0_100)(value, this.valuesRangeMin, this.valuesRangeMax);
                console.log('Alexa Getter Brightness:', value, '->', alexaValue);
                return alexaValue;
            },
            multiPurposeProperty: !this.states[map.on], // Could handle powerState events
            handleSimilarEvents: true, // If power set ON and brightness is 0, set to non-zero value
            offValue,
            onValue,
            percentage: true,
        };
    }
    composeInitObjectColor() {
        const map = this.statesMap;
        return {
            hal: {
                hue: this.states[map.hue],
                saturation: this.states[map.saturation],
                brightness: this.states[map.dimmer] || this.states[map.brightness],
            },
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
exports.default = Hue;
//# sourceMappingURL=Hue.js.map