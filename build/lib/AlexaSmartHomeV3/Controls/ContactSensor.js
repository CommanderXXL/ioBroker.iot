"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ContactSensor_1 = require("../Alexa/Capabilities/ContactSensor");
const ReadOnlyDetector_1 = __importDefault(require("./ReadOnlyDetector"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class ContactSensor extends ReadOnlyDetector_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        this._supported = [this.capability, new EndpointHealth_1.default(this.connectivityInitObject(true))];
    }
    get capability() {
        return new ContactSensor_1.ContactSensor(this.detectedStateInitObject());
    }
    get categories() {
        return ['CONTACT_SENSOR'];
    }
}
exports.default = ContactSensor;
//# sourceMappingURL=ContactSensor.js.map