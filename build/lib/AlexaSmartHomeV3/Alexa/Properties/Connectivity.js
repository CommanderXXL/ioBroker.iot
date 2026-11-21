"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
class Connectivity extends Base_1.default {
    constructor(opts) {
        super(opts);
    }
    static matches(event) {
        return event?.directive?.header?.namespace === 'Alexa.EndpointHealth';
    }
    matches(event) {
        return Connectivity.matches(event);
    }
    reportValue(isError) {
        return isError ? { value: 'UNREACHABLE' } : { value: 'OK' };
    }
    alexaValue(isError) {
        return isError;
    }
}
exports.default = Connectivity;
//# sourceMappingURL=Connectivity.js.map