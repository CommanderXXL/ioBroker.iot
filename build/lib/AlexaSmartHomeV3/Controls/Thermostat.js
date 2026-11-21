"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TemperatureSensor_1 = __importDefault(require("../Alexa/Capabilities/TemperatureSensor"));
const ThermostatController_1 = __importDefault(require("../Alexa/Capabilities/ThermostatController"));
const PowerController_1 = __importDefault(require("../Alexa/Capabilities/PowerController"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const Utils_1 = require("../Helpers/Utils");
const TargetSetpoint_1 = __importDefault(require("../Alexa/Properties/TargetSetpoint"));
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Thermostat extends AdjustableControl_1.default {
    _temperatureSensor = null;
    constructor(detectedControl) {
        super(detectedControl);
        const temperatureSensorConfig = this.composeInitObjectTemperature();
        this._supported = [
            new ThermostatController_1.default(this.composeInitObjectTargetSetpoint(), this.composeInitObjectThermostatMode()),
        ];
        if (temperatureSensorConfig) {
            this._temperatureSensor = new TemperatureSensor_1.default(temperatureSensorConfig);
            this._supported.push(this._temperatureSensor);
        }
        const map = this.statesMap;
        // if the state POWER is present, then we can switch it ON/OFF
        if (this.states[map.power]) {
            this._supported.push(new PowerController_1.default(this.composeInitObjectPowerState()));
        }
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        if (this._temperatureSensor) {
            return ['THERMOSTAT', 'TEMPERATURE_SENSOR'];
        }
        return ['THERMOSTAT'];
    }
    adjustableProperties() {
        return [TargetSetpoint_1.default];
    }
    composeInitObjectPowerState() {
        const map = this.statesMap;
        return {
            setState: this.states[map.power] || this.states[map.set],
            getState: this.states[map.power] || this.states[map.set],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
        };
    }
    composeInitObjectTemperature() {
        const map = this.statesMap;
        const detectorState = this.states[map.actual];
        if (!detectorState) {
            return null;
        }
        return {
            setState: detectorState,
            getState: detectorState,
        };
    }
    composeInitObjectTargetSetpoint() {
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.set],
            alexaSetter: function (alexaValue) {
                return (0, Utils_1.ensureValueInRange)(alexaValue, this.valuesRangeMin, this.valuesRangeMax);
            },
            alexaGetter: function (value) {
                return value;
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
}
exports.default = Thermostat;
//# sourceMappingURL=Thermostat.js.map