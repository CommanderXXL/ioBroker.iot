"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
class DetectionState extends Base_1.default {
    constructor(opts) {
        super(opts);
    }
    static matches(event) {
        return (event?.directive?.header?.namespace === 'Alexa.MotionSensor' ||
            event?.directive?.header?.namespace === 'Alexa.ContactSensor');
    }
    matches(event) {
        return DetectionState.matches(event);
    }
    static get DETECTED() {
        return 'DETECTED';
    }
    static get NOT_DETECTED() {
        return 'NOT_DETECTED';
    }
    alexaValue(value) {
        return value ? DetectionState.DETECTED : DetectionState.NOT_DETECTED;
    }
    value(alexaValue) {
        return alexaValue === DetectionState.DETECTED;
    }
}
exports.default = DetectionState;
//# sourceMappingURL=DetectionState.js.map