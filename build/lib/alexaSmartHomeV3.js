"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DeviceManager_1 = __importDefault(require("./AlexaSmartHomeV3/DeviceManager"));
const AdapterProvider_1 = __importDefault(require("./AlexaSmartHomeV3/Helpers/AdapterProvider"));
const IotProxy_1 = __importDefault(require("./AlexaSmartHomeV3/Helpers/IotProxy"));
const RateLimiter_1 = __importDefault(require("./AlexaSmartHomeV3/Helpers/RateLimiter"));
class AlexaSH3 {
    deviceManager;
    constructor(options) {
        this.deviceManager = new DeviceManager_1.default();
        AdapterProvider_1.default.init(options.adapter);
        IotProxy_1.default.init(options.iotDevice, options.iotClientId, options.adapter.login);
        RateLimiter_1.default.init().catch((err) => options.adapter.log.error(err.message));
        // Subscribe on enum changes
        options.adapter.subscribeForeignObjects('enum.functions.*');
        options.adapter.subscribeForeignObjects('enum.rooms.*');
    }
    setLanguage(lang) {
        this.deviceManager.language = lang;
    }
    async process(event) {
        return await this.deviceManager.handleAlexaEvent(event);
    }
    async updateDevices() {
        await this.deviceManager.collectEndpoints();
    }
    setValidTill(validTill) {
        this.deviceManager?.setValidTill(validTill);
    }
    async getDevices(collectDevices) {
        if (this.deviceManager && collectDevices) {
            await this.deviceManager.collectEndpoints();
        }
        const endpoints = this.deviceManager?.endpoints || [];
        const result = [];
        for (let p = 0; p < endpoints.length; p++) {
            const endpoint = endpoints[p];
            const controls = [];
            for (let c = 0; c < endpoint.controls.length; c++) {
                const control = endpoint.controls[c];
                let supported = [];
                let enforced = [];
                control.supported.forEach(item => item.properties.forEach(prop => !supported.includes(prop.constructor.name) && supported.push(prop.constructor.name)));
                control.enforced.forEach(item => item.properties.forEach(prop => !enforced.includes(prop.constructor.name) && enforced.push(prop.constructor.name)));
                supported = supported.map(prop => prop.replace(/^[A-Z]/, c => c.toLowerCase())).sort();
                enforced = enforced.map(prop => prop.replace(/^[A-Z]/, c => c.toLowerCase())).sort();
                controls.push({
                    type: control.log._component,
                    states: control.states,
                    // always sort by id, so the GUI can address the group by the first control
                    supported,
                    // always sort by id, so the GUI can address the group by the first control
                    enforced,
                    state: await control.reportState(),
                });
            }
            // always sort by id, so the GUI can address the group by the first control
            controls.sort((c1, c2) => (c1.type > c2.type ? -1 : c1.type < c2.type ? 1 : 0));
            const device = {
                controls,
                friendlyName: endpoint.friendlyName,
                autoDetected: endpoint.autoDetected,
                possibleTypes: endpoint.possibleTypes,
                typeWasDetected: endpoint.typeWasDetected,
                funcName: endpoint.funcName,
                roomName: endpoint.roomName,
                id: endpoint.id,
                type: endpoint.log._component,
                state: await endpoint.reportState(),
            };
            result.push(device);
        }
        return result;
    }
    async handleStateUpdate(id, state) {
        await this.deviceManager.handleStateUpdate(id, state);
    }
    async handleObjectChange(id, obj) {
        // main.ts subscribes to `*` for unrelated reasons (netatmo, appNotifications, …),
        // so this handler is hit for nearly every object change in the system. Filter to
        // changes that can actually influence the Alexa device tree, otherwise the heavy
        // `collectEndpoints()` runs constantly.
        if (!this.isAlexaRelevantChange(id, obj)) {
            return;
        }
        await this.deviceManager.collectEndpoints();
    }
    isAlexaRelevantChange(id, obj) {
        // Room / function enum changes redefine group membership → always re-detect.
        if (id.startsWith('enum.functions.') || id.startsWith('enum.rooms.')) {
            return true;
        }
        // Cheap exclusion of namespaces that never contribute.
        if (id.startsWith('system.') || id.startsWith('script.')) {
            return false;
        }
        // State already tracked by Alexa: any change (incl. deletion) matters.
        if (this.deviceManager.isStateTracked(id)) {
            return true;
        }
        // New / modified object with a smartName → user just (de)activated it for Alexa.
        if (obj) {
            const common = obj.common;
            if (common?.smartName !== undefined) {
                return true;
            }
            const ns = AdapterProvider_1.default.get().namespace;
            const customSmart = common?.custom?.[ns]?.smartName;
            if (customSmart !== undefined) {
                return true;
            }
        }
        return false;
    }
    pauseEvents() {
        this.deviceManager.pauseEvents();
    }
    async destroy() {
        await this.deviceManager.destroy();
        await AdapterProvider_1.default.get().unsubscribeForeignObjectsAsync('enum.functions.*');
        await AdapterProvider_1.default.get().unsubscribeForeignObjectsAsync('enum.rooms.*');
    }
}
exports.default = AlexaSH3;
//# sourceMappingURL=alexaSmartHomeV3.js.map