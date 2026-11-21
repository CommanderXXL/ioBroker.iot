"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
class SceneController extends Base_1.default {
    constructor() {
        super();
        // SceneController doesn't have properties
        this._properties = [];
    }
    /**
     * Scenes don't report state proactively
     */
    get proactivelyReported() {
        return false;
    }
    /**
     * Scenes don't support ReportState
     */
    get retrievable() {
        return false;
    }
    /**
     * Override alexaResponse to not include properties since SceneController doesn't have any
     */
    get alexaResponse() {
        return {
            interface: this.namespace,
            version: this.version,
            type: 'AlexaInterface',
            supportsDeactivation: false,
        };
    }
}
exports.default = SceneController;
//# sourceMappingURL=SceneController.js.map