"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AdjustablePercentageControl_1 = __importDefault(require("./AdjustablePercentageControl"));
class Percentage extends AdjustablePercentageControl_1.default {
    get categories() {
        return ['OTHER'];
    }
}
exports.default = Percentage;
//# sourceMappingURL=Percentage.js.map