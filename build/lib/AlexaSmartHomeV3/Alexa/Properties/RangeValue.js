"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AdjustableProperty_1 = __importDefault(require("./AdjustableProperty"));
class RangeValue extends AdjustableProperty_1.default {
    static DEFAULT_INSTANCE = 'Range.Value';
    static matches(event) {
        return event?.directive?.header?.namespace === `Alexa.RangeController`;
    }
    get instance() {
        return super.instance ?? RangeValue.DEFAULT_INSTANCE;
    }
    matches(event) {
        // A device can have several RangeControllers (e.g. a blind and a slider): Alexa names the addressed one
        const instance = event?.directive?.header?.instance;
        return RangeValue.matches(event) && (!instance || instance === this.instance);
    }
    alexaDirectiveValue(event) {
        if (RangeValue.directive(event) === RangeValue.SET) {
            return super.alexaDirectiveValue(event);
        }
        const { rangeValueDelta, rangeValueDeltaDefault } = event.directive.payload;
        // Without an amount ("turn it down"), Alexa sends rangeValueDeltaDefault = true and
        // rangeValueDelta = -precision or +precision: use the configured step, but keep the direction
        if (rangeValueDeltaDefault && rangeValueDelta) {
            return Math.sign(rangeValueDelta) * (this.valuesRangeStep ?? Math.abs(rangeValueDelta));
        }
        return rangeValueDelta;
    }
}
exports.default = RangeValue;
//# sourceMappingURL=RangeValue.js.map