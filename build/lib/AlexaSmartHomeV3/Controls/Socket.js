"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PowerController_1 = __importDefault(require("../Alexa/Capabilities/PowerController"));
const Control_1 = __importDefault(require("./Control"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Socket extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        const powerController = new PowerController_1.default(this.powerStateInitObject());
        this._supported = [powerController];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['SMARTPLUG'];
    }
}
exports.default = Socket;
//# sourceMappingURL=Socket.js.map