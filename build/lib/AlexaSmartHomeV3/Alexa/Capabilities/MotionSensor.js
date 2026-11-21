"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Properties_1 = __importDefault(require("../Properties"));
const Base_1 = __importDefault(require("./Base"));
class MotionSensor extends Base_1.default {
    constructor(opts) {
        super();
        this._properties = [new Properties_1.default.DetectionState(opts)];
    }
}
exports.default = MotionSensor;
//# sourceMappingURL=MotionSensor.js.map