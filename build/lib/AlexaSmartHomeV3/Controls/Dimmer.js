"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PowerController_1 = __importDefault(require("../Alexa/Capabilities/PowerController"));
const BrightnessController_1 = __importDefault(require("../Alexa/Capabilities/BrightnessController"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const Utils_1 = require("../Helpers/Utils");
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const Brightness_1 = __importDefault(require("../Alexa/Properties/Brightness"));
const AdapterProvider_1 = __importDefault(require("../Helpers/AdapterProvider"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Dimmer extends AdjustableControl_1.default {
    _powerControllerCapability;
    _powerState;
    _brightnessCapability;
    _brightness;
    _offValue;
    constructor(detectedControl) {
        super(detectedControl);
        this._powerControllerCapability = new PowerController_1.default(this.composeInitObjectPowerState());
        this._powerState = this._powerControllerCapability.powerState;
        this._brightnessCapability = new BrightnessController_1.default(this.composeInitObjectBrightness());
        this._brightness = this._brightnessCapability.brightness;
        this._supported = [this._powerControllerCapability, this._brightnessCapability];
        const valuesRange = (0, Utils_1.configuredRangeOrDefault)(this.states[this.statesMap.set]);
        this._offValue = (0, Utils_1.denormalize_0_100)(AdapterProvider_1.default.deviceOffLevel(), valuesRange.min, valuesRange.max);
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
    async setState(property, value) {
        if (property.propertyName === PowerState_1.default.propertyName) {
            if (this.states[this.statesMap.on_set]) {
                await AdapterProvider_1.default.setState(property.setId, value ?? false);
                property.currentValue = value;
            }
            else {
                // this will be processed in Brightness property
            }
        }
        else {
            await AdapterProvider_1.default.setState(property.setId, value ?? 0);
            property.currentValue = value;
        }
    }
    async getOrRetrieveCurrentValue(property) {
        if (property.currentValue === undefined) {
            property.currentValue = await AdapterProvider_1.default.getState(property.getId);
            // convert non-zero brightness to power = true
            if (property.propertyName === this._powerState.propertyName && property.getId === this._brightness.getId) {
                property.currentValue = property.currentValue > this._offValue;
            }
        }
        if (property.currentValue === undefined) {
            throw new Error(`unable to retrieve ${property.getId}`);
        }
        return property.currentValue;
    }
    composeInitObjectPowerState() {
        const map = this.statesMap;
        return {
            setState: this.states[map.on_set] || this.states[map.set],
            getState: this.states[map.on_actual] || this.states[map.on_set] || this.states[map.set],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
            multiPurposeProperty: !this.states[map.on_set], // Could handle brightness events
            handleSimilarEvents: true, // If brightness set to non-zero value and power is off, turn the lamp on
        };
    }
    composeInitObjectBrightness() {
        /*
            Device of type 'dimmer' can be switched 'ON'/'OFF' and its brightness can be set to a value between 0 and 100.

            If there is no 'ON_SET' state available:
            - switching control 'OFF' is done via setting its brightness to 0
            - switching control 'ON' is done via setting its brightness to the configured 'byOn' value or to the last known brightness.
        */
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
            setState: this.states[map.set],
            getState: this.states[map.actual],
            alexaSetter: function (alexaValue) {
                return ((0, Utils_1.denormalize_0_100)(alexaValue, this.valuesRangeMin, this.valuesRangeMax) ?? 0);
            },
            alexaGetter: function (value) {
                return (0, Utils_1.normalize_0_100)(value, this.valuesRangeMin, this.valuesRangeMax);
            },
            multiPurposeProperty: !this.states[map.on_set], // Could handle powerState events
            handleSimilarEvents: true, // If power set ON and brightness is 0, set to non-zero value
            offValue,
            onValue,
            percentage: true,
        };
    }
}
exports.default = Dimmer;
//# sourceMappingURL=Dimmer.js.map