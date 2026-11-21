"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const RangeValue_1 = __importDefault(require("../Alexa/Properties/RangeValue"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
const Utils_1 = require("../Helpers/Utils");
class Slider extends AdjustableControl_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        const rangeController = new Capabilities_1.default.RangeController(this.rangeInitObject());
        this._supported = [rangeController];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    adjustableProperties() {
        return [RangeValue_1.default];
    }
    async setState(property, value) {
        // todo: byON
        return super.setState(property, value);
    }
    rangeInitObject() {
        const map = this.statesMap;
        return {
            setState: this.states[map.set],
            getState: this.states[map.actual],
            alexaSetter: function (alexaValue) {
                return (0, Utils_1.ensureValueInRange)(alexaValue, this.valuesRangeMin, this.valuesRangeMax);
            },
            alexaGetter: function (value) {
                return value;
            },
        };
    }
}
exports.default = Slider;
// import AdjustablePercentageControl from './AdjustablePercentageControl';
//
// export default class Slider extends AdjustablePercentageControl {}
//# sourceMappingURL=Slider.js.map