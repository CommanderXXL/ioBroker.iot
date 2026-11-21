"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Device_1 = __importDefault(require("./Device"));
const Utils = __importStar(require("./Helpers/Utils"));
const Directives_1 = __importDefault(require("./Alexa/Directives"));
const Controls_1 = __importDefault(require("./Controls"));
const Logger_1 = __importDefault(require("./Helpers/Logger"));
const AdapterProvider_1 = __importDefault(require("./Helpers/AdapterProvider"));
const AlexaResponse_1 = __importDefault(require("./Alexa/AlexaResponse"));
const IotProxy_1 = __importDefault(require("./Helpers/IotProxy"));
const RateLimiter_1 = __importDefault(require("./Helpers/RateLimiter"));
const OverallDailyRateLimitExceeded_1 = __importDefault(require("./Exceptions/OverallDailyRateLimitExceeded"));
const HourlyDeviceRateLimitExceeded_1 = __importDefault(require("./Exceptions/HourlyDeviceRateLimitExceeded"));
const ChangeReport_1 = __importDefault(require("./Alexa/Directives/ChangeReport"));
const Discovery_1 = __importDefault(require("./Alexa/Directives/Discovery"));
const ReportState_1 = __importDefault(require("./Alexa/Directives/ReportState"));
const DiscoveryReporter_1 = __importDefault(require("./Helpers/DiscoveryReporter"));
const node_crypto_1 = require("node:crypto");
const GroupWord = {
    en: 'Group',
    de: 'Gruppe',
    it: 'Gruppo',
    fr: 'Groupe',
    ru: 'Группа',
    es: 'Grupo',
    pl: 'Grupa',
    nl: 'Groep',
};
// const DeviceWord: { [lang: string]: string } = {
//     en: 'Device',
//     de: 'Gerät',
//     it: 'Dispositivo',
//     fr: 'Appareil',
//     ru: 'Устройство',
//     es: 'Dispositivo',
//     pl: 'Urządzenie',
//     nl: 'Dispositivo',
// };
class DeviceManager {
    lang = 'en';
    devices = [];
    subscribed = [];
    log;
    eventsPausedTill = 0; // timestamp
    discoveryReporter = new DiscoveryReporter_1.default();
    collecting = false;
    recollect = false;
    validTill = 0;
    /** Creates a Device Manager */
    constructor() {
        this.log = new Logger_1.default(this);
    }
    async informAboutStatesChange() {
        await AdapterProvider_1.default.get().setStateAsync('smart.updates3', 2, true);
    }
    get language() {
        return this.lang;
    }
    set language(value) {
        this.lang = value;
    }
    setValidTill(validTill) {
        this.validTill = validTill;
    }
    matchDirective(event) {
        if (ChangeReport_1.default.matches(event)) {
            return new ChangeReport_1.default();
        }
        if (Discovery_1.default.matches(event)) {
            return new Discovery_1.default();
        }
        if (ReportState_1.default.matches(event)) {
            return new ReportState_1.default();
        }
        return null;
    }
    get endpoints() {
        return this.devices;
    }
    endpointById(id) {
        return this.devices.find(device => device.id === id);
    }
    /** Returns `true` if the given state id is currently tracked by any device. */
    isStateTracked(id) {
        return this.subscribed.includes(id);
    }
    addDevice(device) {
        this.devices.push(device);
    }
    toDevice(options) {
        const controls = [];
        this.log.debug(`merging controls to a device with name ${options.friendlyName}`);
        options.detectedControls.forEach(item => {
            this.log.silly(`processing control: ${JSON.stringify(item)}`);
            const control = Controls_1.default.factory(item);
            if (control) {
                this.log.debug(`"${item.type}" added to "${options.friendlyName}"`);
                controls.push(control);
            }
            else {
                this.log.debug(`control of type "${item.type}" not supported yet. Skipped.`);
            }
        });
        if (!controls.length) {
            // the controls are not supported yet...
            return;
        }
        // create and add a new device to the collected devices
        this.addDevice(new Device_1.default({
            id: options.friendlyName,
            friendlyName: options.friendlyName,
            controls,
            autoDetected: options.autoDetected,
            roomName: options.roomName,
            funcName: options.funcName,
            toggle: options.toggle,
            possibleTypes: options.possibleTypes,
            typeWasDetected: options.typeWasDetected,
        }));
    }
    getName(name) {
        if (!name) {
            return '';
        }
        if (typeof name === 'object') {
            return name[this.lang] || name.en || '';
        }
        return name;
    }
    async collectEndpoints() {
        if (this.collecting) {
            this.log.debug(`collecting devices already in progress. Skipping...`);
            this.recollect = true;
            return;
        }
        this.collecting = true;
        this.log.debug(`(re)collecting devices...`);
        try {
            // const discoveryNeeded = this.devices.length > 0;
            this.devices = [];
            const defaultToggle = AdapterProvider_1.default.get().config.defaultToggle || false;
            // collect all iobroker controls in terms of iobroker type detector (https://github.com/ioBroker/ioBroker.type-detector)
            const detectedControls = await Utils.controls(AdapterProvider_1.default.get(), this.lang);
            this.log.debug(`type detector found ${detectedControls.length} controls`);
            // Normally, every control is a smart device. But due to the iobroker concept of 'rooms and functions'
            // multiple controls might be merged to a single device.
            // as long as not all controls mapped to a device...
            // detectedControls = detectedControls.filter(c => ['light', 'dimmer'].includes(c.type));
            const createdGroups = [];
            let iteration = 0;
            // First, collect all custom-friendly names assigned by user
            const customNamedControls = [];
            for (const control of detectedControls) {
                if (control.groupNames) {
                    for (const groupName of control.groupNames) {
                        const name = this.getName(groupName);
                        if (!customNamedControls.includes(name)) {
                            customNamedControls.push(name);
                        }
                    }
                }
            }
            while (detectedControls.length) {
                iteration++;
                // take the next control
                const control = detectedControls[0];
                let processedControls = [];
                if (control.room?.common?.name) {
                    if (control.functionality?.common?.name) {
                        // controls in the same room with the same functionality
                        processedControls = detectedControls.filter(item => control.room &&
                            item.room?.id === control.room.id &&
                            control.functionality &&
                            item.functionality?.id === control.functionality.id);
                        let friendlyName = Utils.friendlyNameByRoomAndFunctionName(control, this.lang);
                        // If a friendly name is already used, append Gruppe, Group, Gruppo, Groupe, etc.
                        if (customNamedControls.includes(friendlyName)) {
                            let index = 0;
                            let newFriendlyName = '';
                            do {
                                newFriendlyName = `${friendlyName} ${GroupWord[this.lang] || GroupWord.en}${index ? ` ${index}` : ''}`;
                                index++;
                            } while (customNamedControls.includes(newFriendlyName));
                            friendlyName = newFriendlyName;
                        }
                        this.toDevice({
                            detectedControls: processedControls,
                            friendlyName,
                            autoDetected: true,
                            roomName: this.getName(control.room?.common?.name),
                            funcName: this.getName(control.functionality?.common?.name),
                            toggle: processedControls[0].object?.toggle ?? defaultToggle,
                            possibleTypes: processedControls[0].object?.possibleTypes || [],
                            typeWasDetected: processedControls[0].object?.typeWasDetected || false,
                        });
                    }
                    else {
                        this.log.debug(`Control of type [${control.type}] assigned to room [${this.getName(control.room.common.name)}] has no function. Skipped.`);
                    }
                    // delete all processed controls from detected controls
                    if (processedControls.length > 1) {
                        for (let i = detectedControls.length - 1; i >= 0; i--) {
                            if (processedControls.includes(detectedControls[i])) {
                                detectedControls.splice(i, 1);
                            }
                        }
                    }
                    else {
                        detectedControls.splice(0, 1);
                    }
                }
                else if (control.groupNames?.length) {
                    // no room, but smart name (not only one)
                    const names = [...control.groupNames];
                    names.forEach(groupName => {
                        if (!createdGroups.includes(groupName)) {
                            createdGroups.push(groupName);
                            processedControls = detectedControls.filter(item => item.groupNames?.includes(groupName));
                            this.toDevice({
                                detectedControls: JSON.parse(JSON.stringify(processedControls)),
                                friendlyName: this.getName(groupName),
                                autoDetected: false,
                                toggle: processedControls[0].object?.toggle ?? defaultToggle,
                                possibleTypes: processedControls[0].object?.possibleTypes || [],
                                typeWasDetected: processedControls[0].object?.typeWasDetected || false,
                            });
                            // Remove groupName from all controls to avoid processing it again
                            for (let c = detectedControls.length - 1; c >= 0; c--) {
                                if (detectedControls[c].groupNames) {
                                    const pos = detectedControls[c].groupNames?.indexOf(groupName);
                                    if (pos !== -1) {
                                        detectedControls[c].groupNames.splice(pos, 1);
                                    }
                                    if (!detectedControls[c].groupNames.length) {
                                        detectedControls.splice(c, 1);
                                    }
                                }
                            }
                        }
                    });
                    // Be sure that the processed control is removed
                    const index = detectedControls.indexOf(control);
                    if (index !== -1) {
                        detectedControls.splice(index, 1);
                    }
                }
                else {
                    // delete it from detected controls to avoid endless loop
                    detectedControls.splice(0, 1);
                    // neither room nor smart name
                    this.log.debug(`Control of type [${control.type}] has neither room no smart name. Skipped.`);
                }
                if (iteration > 1000) {
                    this.log.error(`too many iterations while collecting devices. Stopping to avoid endless loop: ${JSON.stringify(detectedControls)}`);
                    break;
                }
            }
            // done
            this.log.debug(`finished collecting devices. there is/are ${this.devices.length} device(s) in total`);
            for (const device of this.devices) {
                this.log.debug(`${device.toString()}`);
            }
            // a new discovery process is needed in case we already had devices and device collection was
            // triggered again by, e.g., a change in room/function enums
            // if (discoveryNeeded) {
            //     this.log.info(`Please delete all managed by ioBroker devices in your Alexa app and then start discovery`);
            // }
            // collect all relevant states to subscribe to updates
            const stateIds = new Set(this.devices
                .flatMap(d => d.controls)
                .flatMap(item => item.supported)
                .flatMap(item => item.properties)
                .map(item => item.getId)
                .filter(id => id));
            this.log.debug(`registering for updates of total ${stateIds.size} states`);
            const newSubscribed = Array.from(stateIds);
            const subscribe = [];
            for (const id of newSubscribed) {
                this.log.silly(`subscribing to updates of ${id}`);
                if (!this.subscribed.includes(id)) {
                    this.subscribed.push(id);
                    if (!subscribe.includes(id)) {
                        subscribe.push(id);
                    }
                }
            }
            this.subscribed.sort();
            // wait till all promises are settled
            if (subscribe.length) {
                await AdapterProvider_1.default.subscribe(subscribe);
            }
            // unsubscribe from unused states
            const unsubscribe = [];
            for (let i = this.subscribed.length - 1; i >= 0; i--) {
                const id = this.subscribed[i];
                if (!newSubscribed.includes(id)) {
                    this.log.silly(`unsubscribing from updates of ${id}`);
                    this.subscribed.splice(i, 1);
                    if (!unsubscribe.includes(id)) {
                        unsubscribe.push(id);
                    }
                }
            }
            if (unsubscribe.length) {
                await AdapterProvider_1.default.unsubscribe(unsubscribe);
            }
            // devices may be gone, renamed or new: tell Alexa, so it does not keep unresponsive ones
            this.discoveryReporter.schedule(
            // half-collected devices would look like deleted ones; the running collection schedules again
            () => (this.collecting ? null : this.devices), () => this.eventsPausedTill >= Date.now());
        }
        catch (e) {
            this.log.error(`failed to collect devices: ${e}`);
            if (e.stack) {
                this.log.error(e.stack);
            }
        }
        this.collecting = false;
        // if during the collection a new collection was triggered, start collecting again
        if (this.recollect) {
            this.recollect = false;
            setTimeout(() => this.collectEndpoints(), 1000);
        }
    }
    async destroy() {
        this.discoveryReporter.destroy();
        const promises = [];
        for (const id of this.subscribed) {
            this.log.silly(`unsubscribing from updates of ${id}`);
            promises.push(AdapterProvider_1.default.unsubscribe(id));
        }
        await Promise.allSettled(promises);
        this.subscribed = [];
    }
    publishStateChange(stateChange) {
        if (this.eventsPausedTill < Date.now()) {
            this.log.silly(`publishing ${JSON.stringify(stateChange)}`);
            IotProxy_1.default.publishStateChange(stateChange);
        }
    }
    pauseEvents() {
        this.eventsPausedTill = Date.now() + 30 * 60 * 1000; // 30 minutes
    }
    async executeWithinRateLimits(endpointId, awaitable, errorResponse) {
        try {
            await RateLimiter_1.default.incrementAndGet(endpointId);
            return await awaitable();
        }
        catch (error) {
            if (error instanceof OverallDailyRateLimitExceeded_1.default || error instanceof HourlyDeviceRateLimitExceeded_1.default) {
                this.log.warn(error.message);
            }
            else {
                this.log.error(error.message);
            }
            return errorResponse;
        }
    }
    async handleAlexaEvent(event) {
        this.log.debug(`incoming Alexa event`);
        this.log.silly(`${JSON.stringify(event)}`);
        if (!event?.directive?.header) {
            throw new Error('Alexa event header is missing');
        }
        let response;
        const directive = this.matchDirective(event);
        if (directive) {
            response = await directive.handle(event, this);
            if (directive instanceof Discovery_1.default) {
                await this.discoveryReporter.discovered(response.event?.payload.endpoints || []);
            }
        }
        else {
            const endpointId = event?.directive?.endpoint?.endpointId;
            const device = endpointId ? this.endpointById(endpointId) : undefined;
            if (device) {
                if (device.supports(event)) {
                    response = await this.executeWithinRateLimits(endpointId, async () => {
                        response = await device.handle(event);
                        if (!AlexaResponse_1.default.isErrorResponse(response)) {
                            // report state change via voice interaction
                            const propertyName = response.context?.properties[0].name;
                            const responseEvent = ChangeReport_1.default.get(device.id, propertyName || '', false, event.directive.header.messageId, response.context?.properties[0].instance);
                            const directive = this.matchDirective(responseEvent);
                            if (directive) {
                                // BF[2024.02.04]: temporarily disabled as produced a huge number of events
                                const stateChange = await directive.handle(responseEvent, this);
                                // get device state (not just one control)
                                const deviceState = await device.reportState();
                                if (JSON.stringify(device.lastReportedState) !== JSON.stringify(deviceState)) {
                                    device.lastReportedState = deviceState;
                                    // fire state change report to Alexa
                                    if (this.validTill > Date.now() || process.env.TESTS_EXECUTION) {
                                        this.publishStateChange(stateChange);
                                    }
                                    await this.informAboutStatesChange();
                                }
                                else {
                                    this.log.debug(`ignoring state change event for ${endpointId} due to the same_ value [${JSON.stringify(deviceState)}]`);
                                }
                            }
                        }
                        return response;
                    }, AlexaResponse_1.default.throttlingException(event).get());
                }
                else {
                    response = AlexaResponse_1.default.directiveNotSupportedByDevice(device.friendlyName, event).get();
                }
            }
            else {
                // Alexa still has a device that is gone here - removed, renamed, or no longer detected
                response = AlexaResponse_1.default.nonExistingEndpoint(event).get();
            }
        }
        this.log.silly(`response: ${JSON.stringify(response)}`);
        return response;
    }
    async handleStateUpdate(id, state) {
        // ignore updates not confirmed by a corresponding device
        if (!state?.ack) {
            this.log.silly(`ignoring state change event for ${id} due to state.ack == ${state?.ack}`);
            return;
        }
        if (id.startsWith(`${AdapterProvider_1.default.get().namespace}.`)) {
            // nop, this is just to inform Alexa app about changes
            return;
        }
        let notFound = true;
        for (const device of this.devices) {
            const property = device.controls
                .flatMap(item => item.supported)
                .flatMap(item => item.properties)
                .find(item => item.getId === id);
            if (property) {
                notFound = false;
                if (property.currentValue === state.val) {
                    this.log.debug(`ignoring state change event for ${id} due to the same value [${state.val}]`);
                }
                else {
                    property.currentValue = state.val;
                    const responseEvent = Directives_1.default.ChangeReport.get(device.id, property.propertyName, true, (0, node_crypto_1.randomUUID)(), property.instance);
                    const directive = this.matchDirective(responseEvent);
                    if (directive) {
                        // BF[2024.02.04]: temporarily disabled as produced a huge number of events
                        const stateChange = await directive.handle(responseEvent, this);
                        // get device state (not just one control)
                        const deviceState = await device.reportState();
                        if (JSON.stringify(device.lastReportedState) !== JSON.stringify(deviceState)) {
                            device.lastReportedState = deviceState;
                            await this.informAboutStatesChange();
                            // fire state change report to Alexa
                            if (this.validTill > Date.now() || process.env.TESTS_EXECUTION) {
                                await this.executeWithinRateLimits(device.id, () => {
                                    this.publishStateChange(stateChange);
                                    return Promise.resolve(stateChange);
                                }, AlexaResponse_1.default.throttlingException(responseEvent).get());
                            }
                        }
                        else {
                            this.log.debug(`ignoring state change event for ${id} due to the same_ value [${JSON.stringify(deviceState)}]`);
                        }
                    }
                }
                // Further devices can have the same id: every name of a comma-separated smartName becomes
                // its own device with its own copy of the controls. The change is reported once, but all
                // copies need the new value, otherwise relative commands and toggling use an outdated one.
                this.updateCachedValues(id, state.val, device);
                break;
            }
        }
        // this should never happen
        if (notFound) {
            this.log.debug(`state id ${id} doesn't belong to any device`);
        }
    }
    /** Sets the cached value of the state `id` in all devices except `reportedDevice` */
    updateCachedValues(id, val, reportedDevice) {
        for (const device of this.devices) {
            if (device === reportedDevice) {
                continue;
            }
            const property = device.controls
                .flatMap(item => item.supported)
                .flatMap(item => item.properties)
                .find(item => item.getId === id);
            if (property) {
                property.currentValue = val;
            }
        }
    }
}
exports.default = DeviceManager;
//# sourceMappingURL=DeviceManager.js.map