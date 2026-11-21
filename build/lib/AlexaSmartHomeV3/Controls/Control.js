"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AlexaResponse_1 = __importDefault(require("../Alexa/AlexaResponse"));
const Utils_1 = require("../Helpers/Utils");
const Logger_1 = __importDefault(require("../Helpers/Logger"));
const AdapterProvider_1 = __importDefault(require("../Helpers/AdapterProvider"));
const PowerState_1 = __importDefault(require("../Alexa/Properties/PowerState"));
const DetectionState_1 = __importDefault(require("../Alexa/Properties/DetectionState"));
/**
 * Represents the base functionality for a control in a smart device. A smart device has at least one control.
 * The specific functionality, natively supported capabilities, etc. are defined in derived classes.
 */
class Control {
    static stateKeys = [
        'ACTUAL',
        'BLUE',
        'BRIGHTNESS',
        'DIMMER',
        'GREEN',
        'HUE',
        'MODE',
        'MUTE',
        'ON',
        'ON_ACTUAL',
        'ON_SET',
        'POWER',
        'RED',
        'RGB',
        'RGBW',
        'SATURATION',
        'SECOND',
        'SET',
        'TEMPERATURE',
        'UNREACH',
        'WHITE',
    ];
    log;
    _supported;
    _enforced;
    _states = {};
    smartName;
    /**
     * @param detectedControl - The detected control in terms of iobroker type detector.
     */
    constructor(detectedControl) {
        this.log = new Logger_1.default(this);
        this.log.silly(`created instance`);
        // find smartName
        const stateWithSmartName = detectedControl.states.find(s => s.smartName);
        this.smartName = stateWithSmartName?.smartName;
        this.initStates(detectedControl);
        this._supported = [];
        this._enforced = [];
    }
    get allCapabilities() {
        return this.supported.concat(this.enforced);
    }
    static get type() {
        return (0, Utils_1.firstLower)((0, Utils_1.className)(this.toString()));
    }
    /**
     * Getter for Alexa categories
     */
    get categories() {
        return ['OTHER'];
    }
    get name() {
        return `${this.constructor.name}`;
    }
    /**
     * Getter for _supported
     */
    get supported() {
        return this._supported;
    }
    /**
     * Getter for _enforced
     */
    get enforced() {
        return this._enforced;
    }
    /**
     * This function returns whether the control natively supports the passed on Alexa directive.
     *
     * @param event The event containing the Alexa directive as it comes from AWS Alexa Service
     * @returns True if the control natively supports the directive, false - otherwise
     */
    supports(event) {
        return this.supported.find(capability => capability.matches(event)) !== undefined;
    }
    /**
     * This function returns whether the control, though doesn't natively support the passed on Alexa directive, but able to handle it.
     *
     * @param event The event containing the Alexa directive as it comes from AWS Alexa Service
     * @returns True if the control can handle the directive, false - otherwise
     */
    canHandle(event) {
        return this.enforced.find(capability => capability.matches(event)) !== undefined;
    }
    /**
     * This function processes an Alexa directive. Usually the result of the processing is setting an iobroker state to some value
     * as a reaction to an interaction with Alexa via voice, app, etc.
     *
     * @param event The event containing the Alexa directive as it comes from AWS Alexa Service
     * @returns Object containing the response to be sent to Alexa Service
     */
    async handle(event) {
        this.log.debug(`handling Alexa event`);
        this.log.silly(`${JSON.stringify(event)}`);
        const properties = this.allCapabilities
            .flatMap(item => item.properties)
            .filter(property => property.matches(event));
        let response = null;
        for (const property of properties) {
            let alexaValue;
            try {
                const setter = this.valueSetter(event);
                alexaValue = await setter(event, property);
            }
            catch (error) {
                this.log.debug(`${error}`);
                this.log.error(`failed handling Alexa event`);
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                return Promise.reject(AlexaResponse_1.default.endpointUnreachable(event).get());
            }
            // even though the handler successfully processed the Alexa event,
            // we return an error here for ENFORCED capabilities, to prevent
            // reporting multiple successes for the same capability and
            // running into a situation of returning a wrong value back to Alexa
            if (this.enforced.find(capability => capability.matches(event))) {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                return Promise.reject(AlexaResponse_1.default.directiveNotSupportedByControl(this.name, event).get());
            }
            if (alexaValue !== undefined) {
                if (!response) {
                    response = AlexaResponse_1.default.handled(event, property.propertyName, property.reportValue(alexaValue), property.instance);
                }
                else {
                    response.addContextProperty({
                        namespace: event?.directive?.header?.namespace,
                        name: property.propertyName,
                        instance: property.instance,
                        value: property.reportValue(alexaValue),
                    });
                }
            }
            // though the processed directive required changing a single value, the response must contain values of all "relevant" properties
            // Please refer to this for details: https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-thermostatcontroller.html#settargettemperature-response-event
        }
        if (response) {
            this.log.silly(`${JSON.stringify(response.get())}`);
            return response.get();
        }
        const errorResponse = AlexaResponse_1.default.directiveNotSupportedByControl(this.name, event);
        this.log.silly(`${JSON.stringify(errorResponse.get())}`);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(errorResponse.get());
    }
    valueSetter(_event) {
        return this.setValue.bind(this);
    }
    async setValue(event, property) {
        // extract alexa value from event
        const alexaValue = property.alexaDirectiveValue(event);
        // convert alexa value to iobroker value
        let value = property.value(alexaValue);
        // if set, the device could support toggle
        if (event.currentState) {
            // console.error(`----------------------------------- command: ${value}, current value: ${JSON.stringify(event.currentState)}`);
            const state = event.currentState.find(item => item.name === property.propertyName);
            if (state && value === true) {
                // it could support toggle.
                // get current value
                const current = property.value(state.value);
                if (current === true) {
                    // turn off
                    value = false;
                }
                else if (current !== false) {
                    const currentValue = await this.getOrRetrieveCurrentValue(property);
                    if (currentValue === true) {
                        // turn off
                        value = false;
                    }
                }
            }
        }
        // set iobroker state
        if (value !== undefined) {
            await this.setState(property, value);
            property.currentValue = value;
            // return value as expected by Alexa
            return property.alexaValue(value);
        }
        return undefined;
    }
    async adjustValue(event, property) {
        // extract Alexa delta value from event
        const delta = property.alexaDirectiveValue(event);
        // get current value
        const currentValue = await this.getOrRetrieveCurrentValue(property);
        // convert the current value to Alexa value
        const valueToAdjust = property.alexaValue(currentValue);
        // adjust Alexa value
        const adjustedValue = (0, Utils_1.ensureValueInRange)(parseFloat(valueToAdjust || '0') + parseFloat(delta || '0'), property.valuesRangeMin, property.valuesRangeMax);
        // convert adjusted value to iobroker value
        const value = property.value(adjustedValue);
        // set iobroker state
        await this.setState(property, value);
        return adjustedValue;
    }
    async getOrRetrieveCurrentValue(property) {
        if (property.currentValue === undefined) {
            const id = property.getId;
            if (!id && property.propertyName === 'connectivity') {
                // this is an exception
                property.currentValue = false;
            }
            else {
                if (!id) {
                    throw new Error(`no ID defined for property "${property.propertyName}" of "${this.name}"`);
                }
                property.currentValue = await AdapterProvider_1.default.getState(id);
            }
        }
        if (property.currentValue === undefined) {
            throw new Error(`unable to retrieve ${property.getId}`);
        }
        return property.currentValue;
    }
    async reportState() {
        const propertiesToReport = [];
        for (const capability of this.supported) {
            for (const property of capability.properties) {
                try {
                    await this.getOrRetrieveCurrentValue(property);
                    // Skip properties whose underlying state has no value yet (e.g. just after
                    // adapter restart). Reporting `{value: null}` to Alexa is rejected as
                    // invalid. Connectivity is exempt because `false` is a valid value there.
                    if (property.currentValue === null && property.propertyName !== 'connectivity') {
                        this.log.debug(`skipping property "${property.propertyName}" of "${this.name}" — value is null`);
                        continue;
                    }
                    const toReport = {
                        namespace: capability.namespace,
                        instance: property.instance,
                        name: property.propertyName,
                        value: property.reportValue(property.alexaValue(property.currentValue)),
                    };
                    if (!toReport.instance) {
                        delete toReport.instance;
                    }
                    propertiesToReport.push(toReport);
                }
                catch (error) {
                    this.log.error(`failed reporting state for property "${property.propertyName}" of "${this.name}"`);
                    if (error.stack) {
                        this.log.debug(`${error.stack}`);
                    }
                    this.log.debug(`${error}`);
                }
            }
        }
        this.log.debug(`reporting state: ${JSON.stringify(propertiesToReport)}`);
        return propertiesToReport;
    }
    toString() {
        return `${this.constructor.name}`;
    }
    initStates(ctrl) {
        for (const stateKey of Control.stateKeys) {
            this._states[stateKey] = ctrl.states.find(s => s.name === stateKey);
        }
    }
    get states() {
        return this._states;
    }
    get statesMap() {
        const map = {};
        for (const stateKey of Control.stateKeys) {
            map[stateKey.toLowerCase()] = stateKey;
        }
        return map;
    }
    async setState(property, value) {
        await AdapterProvider_1.default.setState(property.setId, value);
        property.currentValue = value;
    }
    //-------------------------------------------------------
    // standard property init objects
    //
    blankInitObject() {
        // const states = this.initStates(ctrl);
        const map = this.statesMap;
        return {
            setState: this.states[map.actual],
            getState: this.states[map.actual],
        };
    }
    connectivityInitObject(alwaysReturn) {
        const map = this.statesMap;
        const state = this.states[map.unreach];
        // STICKY_UNREACH stays true till it is acknowledged; the current reachability is in UNREACH
        if (state?.id.toLowerCase().includes('sticky_')) {
            state.id = state.id.replace(/\.sticky_/i, '.');
        }
        if (!state) {
            if (alwaysReturn) {
                return {
                    getState: { id: '', smartName: '', common: {}, name: 'UNREACH' },
                    setState: { id: '', smartName: '', common: {}, name: 'UNREACH' },
                };
            }
            return null;
        }
        return {
            setState: this.states[map.unreach],
            getState: this.states[map.unreach],
        };
    }
    powerStateInitObject() {
        // const states = this.initStates(ctrl);
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual] || this.states[map.set],
            alexaSetter: function (alexaValue) {
                return alexaValue === PowerState_1.default.ON;
            },
            alexaGetter: function (value) {
                return value ? PowerState_1.default.ON : PowerState_1.default.OFF;
            },
        };
    }
    detectedStateInitObject() {
        const map = this.statesMap;
        return {
            setState: this.states[map.actual],
            getState: this.states[map.actual],
            alexaSetter: function (_alexaValue) {
                // should be never called
                return 0;
            },
            alexaGetter: function (value) {
                return value ? DetectionState_1.default.DETECTED : DetectionState_1.default.NOT_DETECTED;
            },
        };
    }
    percentageInitObject() {
        const map = this.statesMap;
        // const range = configuredRangeOrDefault(this.states[map.set]);
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual],
            alexaSetter: function (alexaValue) {
                return ((0, Utils_1.denormalize_0_100)(alexaValue, this.valueRealMin, this.valueRealMax) ||
                    0);
            },
            alexaGetter: function (value) {
                return (0, Utils_1.normalize_0_100)(value, this.valueRealMin, this.valueRealMax);
            },
            percentage: true,
        };
    }
}
exports.default = Control;
//# sourceMappingURL=Control.js.map