"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const AlexaResponse_1 = __importDefault(require("../AlexaResponse"));
const Base_1 = __importDefault(require("./Base"));
const DiscoveryValidator_1 = require("../../Helpers/DiscoveryValidator");
class Discovery extends Base_1.default {
    /**
     * The skill does not forward ChangeReports to Alexa (no event gateway), so no property may be announced as
     * proactively reported: Alexa would wait for changes that never come.
     * "retrievable" stays as the capability declares it: Alexa asks with ReportState, e.g. for the tile in the app
     * or "What's the temperature in the kitchen?".
     *
     * @param obj Discovery response or a part of it
     */
    static setAllProactivelyReportedFalse(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                Discovery.setAllProactivelyReportedFalse(obj[i]);
            }
            return obj;
        }
        if (typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                if (key === 'proactivelyReported') {
                    obj[key] = false;
                }
                else {
                    Discovery.setAllProactivelyReportedFalse(obj[key]);
                }
            }
        }
        return obj;
    }
    handle(event, endpointManager) {
        this.log.debug(`handling Discovery`);
        this.log.silly(`${JSON.stringify(event)}`);
        return Promise.resolve(Discovery.discoveryResponse(endpointManager.endpoints, this.log, event?.directive?.header?.messageId));
    }
    /**
     * Describes the devices exactly as Alexa gets them on discovery. The proactive Alexa.Discovery reports use it
     * too, so Alexa never learns two different versions of the same device.
     *
     * @param endpoints all collected devices
     * @param log logger for the warnings
     * @param messageId message ID of the Discover directive, if any
     */
    static discoveryResponse(endpoints, log, messageId) {
        const response = new AlexaResponse_1.default({
            namespace: Discovery.namespace,
            name: 'Discover.Response',
            messageId,
        });
        let count = 0;
        endpoints.forEach(endpoint => {
            count++;
            if (count > 300) {
                log.warn(`Too many devices. Alexa supports up to 300 devices. ${endpoint.friendlyName} will not be discovered.`);
                return;
            }
            response.addPayloadEndpoint({
                endpointId: endpoint.id,
                description: endpoint.description || undefined,
                friendlyName: endpoint.friendlyName,
                displayCategories: endpoint.displayCategories || [],
                capabilities: endpoint.capabilities?.map(capability => response.asEndpointCapability(capability.alexaResponse)) ||
                    [],
            });
        });
        const json = response.get();
        Discovery.setAllProactivelyReportedFalse(json);
        (0, DiscoveryValidator_1.validateDiscoveryResponse)(json, log);
        return json;
    }
}
exports.default = Discovery;
//# sourceMappingURL=Discovery.js.map