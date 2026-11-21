"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Capabilities_1 = __importDefault(require("../Alexa/Capabilities"));
const Control_1 = __importDefault(require("./Control"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class VacuumCleaner extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        const powerController = new Capabilities_1.default.PowerController(this.powerStateInitObject());
        this._supported = [powerController];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['VACUUM_CLEANER'];
    }
    get statesMap() {
        return {
            set: 'POWER',
            actual: undefined,
        };
    }
}
exports.default = VacuumCleaner;
//# sourceMappingURL=VacuumCleaner.js.map