"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MotionSensor_1 = __importDefault(require("../Alexa/Capabilities/MotionSensor"));
const ReadOnlyDetector_1 = __importDefault(require("./ReadOnlyDetector"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Motion extends ReadOnlyDetector_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        this._supported = [this.capability];
        const illuminanceState = this.illuminanceStateInitObject();
        if (illuminanceState) {
            // this._supported.push(new IlluminanceSensor(illuminanceState));
        }
        this._supported.push(new EndpointHealth_1.default(this.connectivityInitObject(true)));
    }
    illuminanceStateInitObject() {
        const map = this.statesMap;
        return {
            setState: this.states[map.second],
            getState: this.states[map.second],
            alexaSetter: function (_alexaValue) {
                // should be never called
                return 0;
            },
            alexaGetter: function (value) {
                return value;
            },
        };
    }
    get capability() {
        return new MotionSensor_1.default(this.detectedStateInitObject());
    }
    get categories() {
        return ['MOTION_SENSOR'];
    }
}
exports.default = Motion;
//# sourceMappingURL=Motion.js.map