"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Base = void 0;
const Utils_1 = require("../../Helpers/Utils");
const type_detector_1 = require("@iobroker/type-detector");
class Base {
    #setState = null;
    _setId = '';
    _getId = '';
    #valuesRange = { min: 0, max: 100, step: 10 };
    _stateType;
    #currentValue;
    _alexaSetter;
    _alexaGetter;
    #instance;
    _supportedModesAsEnum = {};
    _multiPurposeProperty = false;
    _handleSimilarEvents = false;
    _offValue = 30;
    _onValueInPercent;
    isPercentage = false;
    /**
     * @param opts The object to initialize the corresponding ioBroker state.
     * @param opts.setState The iobroker state to write values to.
     * @param opts.getState The iobroker state to read values from.
     * @param opts.alexaSetter The function to apply to an Alexa value to transform it to the iobroker's one
     * @param opts.alexaGetter The function to apply to an iobroker value to transform it to the Alexa's one
     * @param ignoreStandard If the standard checks should be ignored (used for Color control)
     */
    constructor(opts, ignoreStandard) {
        if (!ignoreStandard) {
            if (!opts.setState) {
                throw new Error(`missing setState in ${this.constructor.name}`);
            }
            this._multiPurposeProperty = !!opts.multiPurposeProperty;
            this._handleSimilarEvents = !!opts.handleSimilarEvents;
            this.#setState = opts.setState;
            this._offValue = opts.offValue || 30;
            this._setId = opts.setState.id;
            this._getId = opts.getState?.id || this._setId;
            this._stateType = opts.setState.common?.type;
            this.#valuesRange = (0, Utils_1.configuredRangeOrDefault)(this.#setState);
            this.#instance = opts.instance;
            this._onValueInPercent = opts.onValue;
            if (opts.percentage) {
                this.isPercentage = true;
                this.#valuesRange.min = 0;
                this.#valuesRange.max = 100;
                this.#valuesRange.step = 10;
            }
        }
        if (opts.alexaSetter) {
            this._alexaSetter = opts.alexaSetter;
        }
        if (opts.alexaGetter) {
            this._alexaGetter = opts.alexaGetter;
        }
    }
    get instance() {
        return this.#instance;
    }
    getSetState() {
        return this.#setState;
    }
    get propertyName() {
        return (0, Utils_1.firstLower)(`${this.constructor.name}`);
    }
    static get propertyName() {
        return (0, Utils_1.firstLower)((0, Utils_1.className)(this.toString()));
    }
    // return ioBroker min
    get valuesRangeMin() {
        return this.#valuesRange.min;
    }
    // return ioBroker max
    get valuesRangeMax() {
        return this.#valuesRange.max;
    }
    get valueRealMax() {
        const type = this.#setState?.smartName?.smartType;
        // Is binary type
        if (type === type_detector_1.Types.socket ||
            type === type_detector_1.Types.light ||
            type === type_detector_1.Types.fireAlarm ||
            type === type_detector_1.Types.floodAlarm ||
            type === type_detector_1.Types.window) {
            return 1;
        }
        return this.#setState?.common?.max === undefined ? 100 : this.#setState.common.max;
    }
    get valueRealMin() {
        return this.#setState?.common?.min === undefined ? 0 : this.#setState.common.min;
    }
    get valueRealStep() {
        if (this.#setState?.common?.step) {
            return this.#setState.common.step;
        }
        if (this.valueRealMax !== undefined && this.valueRealMin !== undefined) {
            return (this.valueRealMax - this.valueRealMin) / 100;
        }
        return undefined;
    }
    get valuesRangeStep() {
        return this.#valuesRange.step;
    }
    get setId() {
        return this._setId;
    }
    get getId() {
        return this._getId;
    }
    /**
     * returns last known iobroker value
     */
    get currentValue() {
        return this.#currentValue;
    }
    set currentValue(value) {
        this.#currentValue = value;
    }
    /** Converts an Alexa value to an ioBroker value */
    value(alexaValue) {
        return this._alexaSetter && typeof alexaValue === 'number'
            ? this._alexaSetter(alexaValue)
            : alexaValue;
    }
    /** Converts an ioBroker value to an Alexa value */
    alexaValue(value) {
        return this._alexaGetter && typeof value === 'number'
            ? this._alexaGetter(value)
            : value;
    }
    static directive(_event) {
        return Base.SET;
    }
    /**
     * Checks whether a directive refers to the property
     *
     * @param event Contains the Alexa event.
     */
    static matches(event) {
        return event?.directive?.header?.namespace === `Alexa.${(0, Utils_1.className)(this.toString())}Controller`;
    }
    matches(event) {
        return event?.directive?.header?.name === this.propertyName;
    }
    /**
     * Extracts value to be set on the smart device sent in an Alexa directive
     */
    alexaDirectiveValue(event) {
        if (this.propertyName === 'color') {
            return event.directive.payload.color;
        }
        if (this.propertyName === 'colorTemperatureInKelvin') {
            return event.directive.payload.colorTemperatureInKelvin;
        }
        if (this.propertyName === 'brightness') {
            return event.directive.payload.brightness;
        }
        if (this.propertyName === 'percentage') {
            return event.directive.payload.percentage;
        }
        if (this.propertyName === 'rangeValue') {
            return event.directive.payload.rangeValue;
        }
        // @ts-expect-error fix later
        return event.directive.payload[this.propertyName];
    }
    reportValue(value) {
        return value;
    }
    static get ADJUST() {
        return 'ADJUST';
    }
    static get SET() {
        return 'SET';
    }
    static get CELSIUS_SCALE() {
        return 'CELSIUS';
    }
    get supportedModesAsEnum() {
        return this._supportedModesAsEnum;
    }
}
exports.Base = Base;
exports.default = Base;
//# sourceMappingURL=Base.js.map