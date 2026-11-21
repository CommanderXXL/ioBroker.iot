"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Properties_1 = __importDefault(require("../Properties"));
const Base_1 = __importDefault(require("./Base"));
class EndpointHealth extends Base_1.default {
    constructor(opts) {
        super();
        opts ||= {};
        opts.getState ||= { id: '', smartName: '', common: {}, name: 'UNREACH' };
        opts.setState ||= { id: '', smartName: '', common: {}, name: 'UNREACH' };
        this._properties = [new Properties_1.default.Connectivity(opts)];
    }
}
exports.default = EndpointHealth;
//# sourceMappingURL=EndpointHealth.js.map