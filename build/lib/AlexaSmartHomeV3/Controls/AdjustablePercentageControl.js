"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const AdjustableControl_1 = __importDefault(require("./AdjustableControl"));
const Percentage_1 = __importDefault(require("../Alexa/Properties/Percentage"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class AdjustablePercentageControl extends AdjustableControl_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        const percentageController = new Capabilities_1.default.PercentageController(this.percentageInitObject());
        this._supported = [percentageController];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    adjustableProperties() {
        return [Percentage_1.default];
    }
    async setState(property, value) {
        // todo: byON
        return super.setState(property, value);
    }
}
exports.default = AdjustablePercentageControl;
//# sourceMappingURL=AdjustablePercentageControl.js.map