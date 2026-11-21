"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
const Brightness_1 = __importDefault(require("../Properties/Brightness"));
class BrightnessController extends Base_1.default {
    #brightness;
    constructor(opts) {
        super();
        this.#brightness = new Brightness_1.default(opts);
        this._properties = [this.#brightness];
    }
    get brightness() {
        return this.#brightness;
    }
}
exports.default = BrightnessController;
//# sourceMappingURL=BrightnessController.js.map