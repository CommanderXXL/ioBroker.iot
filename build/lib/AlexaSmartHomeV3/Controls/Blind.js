"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const RangeController_1 = __importDefault(require("../Alexa/Capabilities/RangeController"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
const RangeValue_1 = __importDefault(require("../Alexa/Properties/RangeValue"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const INSTANCE = 'Blind.Lift';
// Alexa values in percent; level.blind: min = fully closed, max = fully open
const CLOSED = 100;
const OPEN = 0;
function setRangeValue(actions, rangeValue) {
    return { '@type': 'ActionsToDirective', actions, directive: { name: 'SetRangeValue', payload: { rangeValue } } };
}
/**
 * Amazon's model for blinds: Alexa.RangeController with the instance "Blind.Lift" and semantics.
 * With it Alexa understands "open/close the blind" and knows that 0 % means open and 100 % means closed.
 *
 * @see https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-rangecontroller.html#discover-blinds
 */
class BlindLiftController extends RangeController_1.default {
    // the base class derives the namespace from the class name
    get namespace() {
        return 'Alexa.RangeController';
    }
    get alexaResponse() {
        return {
            interface: this.namespace,
            instance: this.instance,
            version: this.version,
            properties: this.discoverableProperties,
            capabilityResources: {
                friendlyNames: [{ '@type': 'asset', value: { assetId: 'Alexa.Setting.Opening' } }],
            },
            configuration: {
                supportedRange: { minimumValue: OPEN, maximumValue: CLOSED, precision: 1 },
                unitOfMeasure: 'Alexa.Unit.Percent',
            },
            // no stateMappings yet: they only serve questions like "Is the blind open?"
            semantics: {
                actionMappings: [
                    setRangeValue(['Alexa.Actions.Close', 'Alexa.Actions.Lower'], CLOSED),
                    setRangeValue(['Alexa.Actions.Open', 'Alexa.Actions.Raise'], OPEN),
                ],
            },
        };
    }
}
class Blind extends AdjustableControl_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        this._supported = [new BlindLiftController({ ...this.percentageInitObject(), instance: INSTANCE })];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['INTERIOR_BLIND'];
    }
    adjustableProperties() {
        return [RangeValue_1.default];
    }
    /**
     * "Alexa, blind down/up" without an amount arrives as AdjustRangeValue with rangeValueDeltaDefault = true
     * and rangeValueDelta = -1/+1. For a blind this means fully closed/open.
     * An explicit amount ("lower the blind by 10 percent") stays relative.
     */
    async adjustValue(event, property) {
        const { rangeValueDelta, rangeValueDeltaDefault } = event.directive.payload;
        if (rangeValueDeltaDefault && rangeValueDelta) {
            const target = rangeValueDelta < 0 ? OPEN : CLOSED;
            await this.setState(property, property.value(target));
            return target;
        }
        return super.adjustValue(event, property);
    }
}
exports.default = Blind;
//# sourceMappingURL=Blind.js.map