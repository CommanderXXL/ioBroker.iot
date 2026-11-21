"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ThermostatController_1 = __importDefault(require("../Alexa/Capabilities/ThermostatController"));
const ThermostatMode_1 = __importDefault(require("../Alexa/Properties/ThermostatMode"));
const PowerController_1 = __importDefault(require("../Alexa/Capabilities/PowerController"));
const TemperatureSensor_1 = __importDefault(require("../Alexa/Capabilities/TemperatureSensor"));
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const Utils_1 = require("../Helpers/Utils");
const TargetSetpoint_1 = __importDefault(require("../Alexa/Properties/TargetSetpoint"));
const AdapterProvider_1 = __importDefault(require("../Helpers/AdapterProvider"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class AirCondition extends AdjustableControl_1.default {
    _thermostatController;
    _thermostatMode;
    _powerController;
    _powerState;
    _lastKnownMode;
    constructor(detectedControl) {
        super(detectedControl);
        this._thermostatController = new ThermostatController_1.default(this.composeInitObjectTargetSetpoint(), this.composeInitObjectThermostatMode());
        this._thermostatMode = this._thermostatController.thermostatMode;
        this._powerController = new PowerController_1.default(this.composeInitObjectPowerState());
        this._powerState = this._powerController.powerState;
        this._supported = [
            new TemperatureSensor_1.default(this.composeInitObjectTemperature()),
            this._thermostatController,
            this._powerController,
        ];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['AIR_CONDITIONER'];
    }
    adjustableProperties() {
        return [TargetSetpoint_1.default];
    }
    get dedicatedOnOff() {
        return this.states[this.statesMap.power] !== undefined;
    }
    async setState(property, value) {
        // if we set power ON/OFF via thermostat mode
        if (property.propertyName === PowerState_1.default.propertyName && !this.dedicatedOnOff) {
            // set the mode to the last known value or AUTO by switching power ON
            if (value) {
                this._lastKnownMode ||= this._thermostatMode.supportedModesAsEnum[ThermostatMode_1.default.AUTO];
                await AdapterProvider_1.default.setState(this._thermostatMode.setId, this._lastKnownMode);
                this._thermostatMode.currentValue = this._lastKnownMode;
                this._powerState.currentValue = true;
            }
            else {
                // set mode to OFF
                const modeOffValue = this._thermostatMode.supportedModesAsEnum[ThermostatMode_1.default.OFF];
                await AdapterProvider_1.default.setState(this._thermostatMode.setId, modeOffValue);
                this._thermostatMode.currentValue = modeOffValue;
                this._powerState.currentValue = false;
            }
        }
        else {
            // just set the property
            await AdapterProvider_1.default.setState(property.setId, value);
            property.currentValue = value;
            if (property.propertyName === ThermostatMode_1.default.propertyName) {
                this._lastKnownMode = value;
                if (!this.dedicatedOnOff) {
                    this._powerState.currentValue = this._thermostatMode.alexaValue(value) !== ThermostatMode_1.default.OFF;
                }
            }
        }
    }
    async getOrRetrieveCurrentValue(property) {
        if (property.currentValue === undefined) {
            property.currentValue = await AdapterProvider_1.default.getState(property.getId);
            // convert mode != OFF to power = true
            if (property.propertyName === this._powerState.propertyName && !this.dedicatedOnOff) {
                property.currentValue =
                    property.currentValue !== this._thermostatMode.supportedModesAsEnum[ThermostatMode_1.default.OFF];
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
            setState: this.states[map.power] || this.states[map.mode],
            getState: this.states[map.power] || this.states[map.mode],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
        };
    }
    composeInitObjectThermostatMode() {
        const map = this.statesMap;
        // extract all modes
        const modes = this.states[map.mode];
        let states = modes?.common?.states || {};
        const supportedModes = [];
        if (states) {
            if (Array.isArray(states)) {
                const _states = {};
                states.forEach(state => {
                    _states[state] = state.toUpperCase();
                });
                states = _states;
            }
            // Try map to known modes 'AUTO' | 'COOL' | 'HEAT' | 'OFF' | 'ECO' | 'EM_HEAT'
            Object.keys(states).forEach(state => {
                const mode = states[state].toUpperCase();
                if (mode.includes('AUTO')) {
                    supportedModes[parseInt(state, 10)] = 'AUTO';
                    states[state] = 'AUTO';
                }
                else if (mode.includes('COOL')) {
                    supportedModes[parseInt(state, 10)] = 'COOL';
                    states[state] = 'COOL';
                }
                else if (mode.includes('HEAT')) {
                    supportedModes[parseInt(state, 10)] = 'HEAT';
                    states[state] = 'HEAT';
                }
                else if (mode.includes('ECO')) {
                    supportedModes[parseInt(state, 10)] = 'ECO';
                    states[state] = 'ECO';
                }
                else if (mode.includes('OFF')) {
                    supportedModes[parseInt(state, 10)] = 'OFF';
                    states[state] = 'OFF';
                }
                else {
                    states[state] = mode;
                }
            });
        }
        if (!supportedModes.length) {
            supportedModes.push('AUTO');
        }
        return {
            setState: this.states[map.mode] || { id: undefined },
            getState: this.states[map.mode] || { id: undefined },
            alexaSetter: function (alexaValue) {
                // Convert 'AUTO' and so on into 0, 1
                const pos = Object.keys(states).indexOf(alexaValue);
                if (pos !== -1) {
                    return Object.keys(states)[pos];
                }
                return 0;
            },
            alexaGetter: function (value) {
                return (value !== undefined && states[value]) || 'AUTO';
            },
            supportedModes: supportedModes,
        };
    }
    composeInitObjectTargetSetpoint() {
        const map = this.statesMap;
        // const range = Utils.configuredRangeOrDefault(this.states[map.set]);
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual] || this.states[map.set],
            alexaSetter: function (alexaValue) {
                return (0, Utils_1.ensureValueInRange)(alexaValue, this.valuesRangeMin, this.valuesRangeMax);
            },
            alexaGetter: function (value) {
                return value || 0;
            },
        };
    }
    composeInitObjectTemperature() {
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual] || this.states[map.set],
        };
    }
}
exports.default = AirCondition;
//# sourceMappingURL=AirCondition.js.map