"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Properties_1 = __importDefault(require("../Properties"));
const Base_1 = __importDefault(require("./Base"));
class TemperatureSensor extends Base_1.default {
    constructor(opts) {
        super();
        this._properties = [new Properties_1.default.Temperature(opts)];
    }
}
exports.default = TemperatureSensor;
//# sourceMappingURL=TemperatureSensor.js.map