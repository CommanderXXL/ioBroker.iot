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
exports.parseISOString = parseISOString;
exports.configuredRangeOrDefault = configuredRangeOrDefault;
exports.currentHour = currentHour;
exports.isToday = isToday;
exports.isCurrentHour = isCurrentHour;
exports.endpointId = endpointId;
exports.onlyValidCharactersAndLengthForFriendlyName = onlyValidCharactersAndLengthForFriendlyName;
exports.stringify = stringify;
exports.friendlyNameByRoomAndFunctionName = friendlyNameByRoomAndFunctionName;
exports.isValidSmartName = isValidSmartName;
exports.defaultIfNullOrEmpty = defaultIfNullOrEmpty;
exports.controls = controls;
exports.normalize_0_100 = normalize_0_100;
exports.normalize_0_1 = normalize_0_1;
exports.denormalize_0_100 = denormalize_0_100;
exports.denormalize_0_1 = denormalize_0_1;
exports.distinctByPropertyName = distinctByPropertyName;
exports.className = className;
exports.ensureValueInRange_0_100 = ensureValueInRange_0_100;
exports.ensureValueInRange = ensureValueInRange;
exports.firstLower = firstLower;
exports.closestFromList = closestFromList;
exports.asEnum = asEnum;
exports.hal2rgb = hal2rgb;
exports.hal2rgbw = hal2rgbw;
exports.rgb2hal = rgb2hal;
exports.rgbwToHex = rgbwToHex;
exports.rgbw2hal = rgbw2hal;
const node_crypto_1 = require("node:crypto");
const AdapterProvider_1 = __importDefault(require("./AdapterProvider"));
const type_detector_1 = __importStar(require("@iobroker/type-detector"));
const roleEnumUtils_1 = require("@iobroker/type-detector/build/roleEnumUtils");
const rooms_1 = __importDefault(require("../../rooms"));
const functions_1 = __importDefault(require("../../functions"));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onlyValidCharactersAndLength(name) {
    return name.substring(0, 128).replace(/[^.a-zA-Z0-9äÄüÜöÖßÉéÈèÀàÂâÊêÙùÛûÇçÎîËëÏïŸÿÔôŒœãõìòáíóú]+/g, ' ');
}
function isRoom(enumObject) {
    return enumObject?._id?.startsWith('enum.rooms.');
}
function isFunctionality(enumObject) {
    return enumObject?._id?.startsWith('enum.functions.');
}
async function allEnums(adapter) {
    const result = await adapter.getObjectViewAsync('system', 'enum', {});
    return result.rows.map(row => row.value);
}
function parentOf(id) {
    const parts = (id || '').split('.');
    parts.pop();
    return parts.join('.');
}
async function allObjects(adapter) {
    const states = await adapter.getObjectViewAsync('system', 'state', {});
    const channels = await adapter.getObjectViewAsync('system', 'channel', {});
    const devices = await adapter.getObjectViewAsync('system', 'device', {});
    const enums = await adapter.getObjectViewAsync('system', 'enum', {});
    return states.rows
        .concat(channels.rows)
        .concat(devices.rows)
        .concat(enums.rows)
        .reduce((obj, item) => ((obj[item.id] = {
        common: item.value?.common,
        type: item.value?.type,
    }),
        obj), {});
}
// Automatically convert AlexaV2 to V3
const SMART_TYPES = {
    LIGHT: type_detector_1.Types.light,
    SWITCH: type_detector_1.Types.socket,
    THERMOSTAT: type_detector_1.Types.thermostat,
    SMARTPLUG: type_detector_1.Types.socket,
    SMARTLOCK: type_detector_1.Types.lock,
    CAMERA: type_detector_1.Types.camera,
    blinds: type_detector_1.Types.blind, // error in the GUI
    levelSlider: type_detector_1.Types.slider, // error in the GUI
    TV: type_detector_1.Types.button,
    // e.g. a state of the scene adapter: true activates it
    SCENE_TRIGGER: type_detector_1.Types.button,
    ACTIVITY_TRIGGER: type_detector_1.Types.button,
};
function getSmartNameFromObj(obj, instanceId, lang, noCommon) {
    if (!obj) {
        return undefined;
    }
    let result;
    // If it is a common object
    if (!obj.common) {
        result = obj.smartName;
    }
    else if (!noCommon) {
        result = obj.common.smartName;
    }
    else {
        const custom = obj.common.custom;
        if (!custom) {
            return undefined;
        }
        result = custom[instanceId] ? custom[instanceId].smartName : undefined;
    }
    if (result && typeof result === 'string') {
        if (result === 'ignore') {
            return false;
        }
        return {
            [lang]: result,
        };
    }
    // @ts-expect-error backwards compatibility
    if (result === true) {
        // Bug??
        return undefined;
    }
    return result;
}
async function functionalitiesAndRooms(adapter, lang) {
    const enumerations = await allEnums(adapter);
    // skip empty enums (with no members, i.e. states, assigned)
    const notEmptyRoomsAndFunctionalities = enumerations
        .filter(item => {
        const smartName = getSmartNameFromObj(item, adapter.namespace, lang, adapter.config.noCommon);
        return smartName !== false;
    })
        .filter(item => item?.common?.members?.length);
    // all enums that are of type 'function'
    const functionalities = notEmptyRoomsAndFunctionalities.filter(item => isFunctionality(item));
    // all enums, that are of type 'room'
    const rooms = notEmptyRoomsAndFunctionalities.filter(item => isRoom(item));
    return [functionalities, rooms];
}
function getChannelId(id, objects) {
    if (objects[id]?.type === 'channel') {
        return id;
    }
    if (objects[id]?.type === 'state') {
        const channelId = parentOf(id);
        if (objects[channelId]?.type === 'channel') {
            return channelId;
        }
        return null;
    }
}
function getDeviceId(id, objects) {
    const channelId = getChannelId(id, objects);
    if (channelId) {
        const deviceId = parentOf(channelId);
        if (objects[deviceId] && (objects[deviceId].type === 'device' || objects[deviceId].type === 'channel')) {
            return deviceId;
        }
    }
    return null;
}
function parseISOString(dateTimeAsISOString) {
    const [year, month, date, hours, minutes, seconds, ms] = dateTimeAsISOString.split(/\D+/);
    return new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(date, 10), parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10), parseInt(ms, 10)));
}
function configuredRangeOrDefault(state) {
    if (state.common?.type === 'boolean') {
        return { min: false, max: true };
    }
    // null or '' is no limit: parseFloat() would make NaN of it, and NaN breaks every clamp to the range
    const toNumber = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value);
        return Number.isFinite(num) ? num : undefined;
    };
    const min = toNumber(state.common?.min) ?? 0;
    const max = toNumber(state.common?.max) ?? 100;
    const step = toNumber(state.common?.step) ?? (max - min) / 10;
    return { min, max, step };
}
function currentHour() {
    const datetime = new Date();
    datetime.setMinutes(0);
    datetime.setSeconds(0);
    return datetime;
}
function isToday(dateTime) {
    const today = new Date();
    return (dateTime.getDate() === today.getDate() &&
        dateTime.getMonth() === today.getMonth() &&
        dateTime.getFullYear() === today.getFullYear());
}
function isCurrentHour(dateTime) {
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - dateTime.getTime()) / 3.6e6;
    return diffInHours < 1;
}
function endpointId(id) {
    // even more restrictive than Alexa documents
    const regex = /^[A-Za-z0-9\-_]{1,256}$/g;
    id = id.replace(/\s/g, '_');
    if (!regex.test(id)) {
        const hash = (0, node_crypto_1.createHash)('sha256').update(id).digest('hex');
        id = `${hash}_${id.replace(/[^A-Za-z0-9\-_]+/g, '-')}`.substring(0, 256);
    }
    return id;
}
function onlyValidCharactersAndLengthForFriendlyName(name) {
    return name.substring(0, 128).replace(/[^.a-zA-Z0-9äÄüÜöÖßÉéÈèÀàÂâÊêÙùÛûÇçÎîËëÏïŸÿÔôŒœãõìòáíóú]+/g, ' ');
}
function stringify(smartName, lang) {
    if (smartName && typeof smartName === 'object') {
        return smartName[lang] || smartName.en || '';
    }
    if (!smartName) {
        return '';
    }
    return onlyValidCharactersAndLengthForFriendlyName(smartName);
}
function friendlyNameByRoomAndFunctionName(control, lang) {
    const config = AdapterProvider_1.default.get().config;
    const funcNameFirst = config.functionFirst;
    let concatenation = config.concatWord;
    let name;
    let roomName = control.room?.common?.name;
    let translateRoomName;
    if (typeof roomName === 'object') {
        // try to translate from EN to any other language
        translateRoomName = lang && lang !== 'en' && !roomName[lang];
        roomName = roomName[lang] || roomName.en || '';
    }
    else {
        // always try to translate room names provided as a non-object type
        translateRoomName = true;
    }
    if (translateRoomName && roomName) {
        roomName = (0, rooms_1.default)(lang, roomName);
    }
    let funcName = control.functionality?.common?.name;
    let translateFunctionalityName;
    if (typeof funcName === 'object') {
        translateFunctionalityName = lang && lang !== 'en' && !funcName[lang];
        funcName = funcName[lang] || funcName.en;
    }
    else {
        translateFunctionalityName = true;
    }
    if (translateFunctionalityName && funcName) {
        funcName = (0, functions_1.default)(lang, funcName);
    }
    concatenation = concatenation ? ` ${concatenation} ` : ' ';
    name = `${funcNameFirst ? funcName : roomName}${concatenation}${funcNameFirst ? roomName : funcName}`;
    name = name.trim();
    return onlyValidCharactersAndLengthForFriendlyName(name);
}
/**
 * Checks whether the provided value is a valid smart name.
 *
 * @param smartName The value to check
 * @param lang Configured language
 * @returns True if a valid smart name, false - otherwise.
 */
function isValidSmartName(smartName, lang) {
    let name = smartName;
    if (smartName === false || smartName === 'ignore') {
        return false;
    }
    if (smartName && typeof smartName === 'object') {
        name = smartName[lang] || smartName.en || smartName.de;
    }
    return ![null, undefined, 'ignore', false].includes(name);
}
/**
 * Checks a value for validity or returns a default.
 *
 * @param value The value being checked
 * @param defaultValue A default value if the passed value is not valid
 * @returns The passed value if valid otherwise the default value.
 */
function defaultIfNullOrEmpty(value, defaultValue) {
    if (value === undefined ||
        value === null ||
        (typeof value === 'object' && Object.keys(value).length === 0) ||
        value === '') {
        return defaultValue;
    }
    return value;
}
/**
 * Inspects all objects (states, channels and devices) and tries to identify so-called 'controls'
 *
 * To identify the controls, the ioBroker type detector library is used (https://github.com/ioBroker/ioBroker.type-detector).
 *
 * @param adapter The iot adapter instance
 * @param lang language
 * @returns An array containing the detected controls
 */
async function controls(adapter, lang) {
    // here we collect ids to inspect
    const list = [];
    const detectionMethod = adapter.config.detectionMethod || 'enums';
    const enumsMode = detectionMethod !== 'devices';
    // fetch all objects (states, channels and devices in terms of iobroker)
    const devicesObject = await allObjects(adapter);
    adapter.log.debug(`[ALEXA3] Starting control detection with ${Object.keys(devicesObject).length} objects (mode: ${detectionMethod})...`);
    // fetch all defined rooms and functions (enumerations)
    const [functionalities, rooms] = await functionalitiesAndRooms(adapter, lang);
    adapter.log.debug(`[ALEXA3] Found ${functionalities.length} functionalities and ${rooms.length} rooms...`);
    // In "devices" detection mode, skip enum-based auto-discovery — only states with
    // explicit valid smartName are exposed (the user picks them individually in the Devices tab).
    if (enumsMode) {
        // every member of a function enumeration is added to the list of ids to inspect
        functionalities.forEach(functionEnumItem => {
            functionEnumItem?.common?.members?.forEach(id => {
                if (!devicesObject[id]) {
                    // Enum has unknown member
                    return;
                }
                const smartName = getSmartNameFromObj(devicesObject[id], adapter.namespace, lang, adapter.config.noCommon);
                const objType = devicesObject[id].type;
                if (devicesObject[id].common &&
                    (objType === 'state' || objType === 'channel' || objType === 'device') &&
                    !list.includes(id) &&
                    smartName !== false // if the device is not disabled
                ) {
                    const channelId = getChannelId(id, devicesObject);
                    if (channelId) {
                        if (!list.includes(channelId)) {
                            const deviceId = getDeviceId(id, devicesObject);
                            if (deviceId) {
                                if (!list.includes(deviceId)) {
                                    list.push(id);
                                }
                            }
                            else {
                                list.push(id);
                            }
                        }
                    }
                    else {
                        list.push(id);
                    }
                }
            });
        });
        // a member of a room enumeration is only added if neither its parent (channel) nor its grandparent (device) is in
        rooms.forEach(roomEnumItem => {
            roomEnumItem.common.members?.forEach(id => {
                if (!devicesObject[id]) {
                    return;
                }
                const smartName = getSmartNameFromObj(devicesObject[id], adapter.namespace, lang, adapter.config.noCommon);
                const objType = devicesObject[id].type;
                if (devicesObject[id].common &&
                    (objType === 'state' || objType === 'channel' || objType === 'device') &&
                    !list.includes(id) &&
                    smartName !== false // if the device is not disabled
                ) {
                    const channelId = getChannelId(id, devicesObject);
                    if (channelId) {
                        if (!list.includes(channelId)) {
                            const deviceId = getDeviceId(id, devicesObject);
                            if (deviceId) {
                                if (!list.includes(deviceId)) {
                                    list.push(id);
                                }
                            }
                            else {
                                list.push(id);
                            }
                        }
                    }
                    else {
                        list.push(id);
                    }
                }
            });
        });
    }
    // all ids, i.e. ids of all iobroker states/channels/devices
    const keys = Object.keys(devicesObject).sort();
    adapter.log.debug(`[ALEXA3] collected ${keys.length} states from categories...`);
    const idsWithSmartName = [];
    const idsToDelete = [];
    // if a state has got a smart name directly assigned and neither itself nor its channel is in the list, add its id to the inspection list
    // and process it first
    keys.forEach(id => {
        const smartName = devicesObject[id] &&
            getSmartNameFromObj(devicesObject[id], adapter.namespace, lang, adapter.config.noCommon);
        const objType = devicesObject[id].type;
        if (isValidSmartName(smartName, lang) &&
            devicesObject[id].common &&
            (objType === 'state' || objType === 'channel' || objType === 'device')) {
            idsWithSmartName.push(id);
        }
        else if (smartName === false) {
            // Remove this state completely from the list
            idsToDelete.push(id);
        }
    });
    // remove all ids that are disabled from the list by smartName: false
    if (idsToDelete.length) {
        for (let d = idsToDelete.length - 1; d >= 0; d--) {
            const id = idsToDelete[d];
            const pos = list.indexOf(id);
            if (pos !== -1) {
                list.splice(pos, 1);
                delete devicesObject[id];
            }
        }
    }
    adapter.log.debug(`[ALEXA3] collected ${keys.length} smart names...`);
    // collect first all smart names and remove them from the auto-groups
    const detectedControls = [];
    const detector = new type_detector_1.default();
    const patterns = type_detector_1.default.getPatterns();
    const usedIds = [];
    const ignoreIndicators = ['UNREACH_STICKY']; // Ignore indicators by name
    const excludedTypes = [type_detector_1.Types.info];
    // initialize iobroker type detector
    const options = {
        objects: devicesObject,
        _keysOptional: keys,
        _usedIdsOptional: usedIds,
        ignoreIndicators,
        excludedTypes,
        detectOnlyChannel: true,
        detectAllPossibleDevices: true,
        id: '', // this will be set for each id in the list
        ignoreEnums: true,
    };
    // process states with defined smartName
    for (let s = 0; s < idsWithSmartName.length; s++) {
        const id = idsWithSmartName[s];
        const common = devicesObject[id].common;
        const smartName = getSmartNameFromObj(devicesObject[id], adapter.namespace, lang, adapter.config.noCommon);
        if (!smartName) {
            continue;
        }
        options.id = id;
        options.detectAllPossibleDevices = !smartName.noAutoDetect;
        // If ID is hue, prioritize hue
        if (devicesObject[id].common.role?.includes('.hue')) {
            options.prioritizedTypes = [[type_detector_1.Types.hue, type_detector_1.Types.rgb]];
        }
        else if (options.prioritizedTypes) {
            delete options.prioritizedTypes;
        }
        const parentType = devicesObject[parentOf(id)]?.type;
        options.detectOnlyChannel = !smartName.noAutoDetect && (parentType === 'channel' || parentType === 'device');
        // Try to detect with typeDetector
        let controls = detector.detect(options);
        if (smartName.noAutoDetect && controls?.length) {
            // get only first control
            controls = [controls[0]];
            // And take only first state
            const state = controls[0].states.find(state => state.required || state.requiredOneOf);
            if (state) {
                state.id = id;
                controls[0].states = [state];
            }
        }
        // Fix GUI error
        if (smartName.smartType === 'blinds') {
            smartName.smartType = type_detector_1.Types.blind;
        }
        else if (smartName.smartType === 'levelSlider') {
            smartName.smartType = type_detector_1.Types.slider;
        }
        // if (smartName.smartType) {
        //     options.limitTypesToOneOf = [smartName.smartType];
        // } else if (options.prioritizedTypes) {
        //     delete options.prioritizedTypes;
        // }
        const possibleTypes = controls?.map(c => c.type) || [];
        const typeWasDetected = !smartName.smartType;
        // try to convert the state to typeDetector format
        // "smartName": {
        //    "de": "Rote Lampe",
        //    "smartType": "LIGHT", // optional
        //    "byON": 80            // optional
        //  }
        if (!smartName.smartType) {
            // by default,
            if (controls && controls.length > 0) {
                // take the first detected control that has initial ID
                const control = controls.find(c => c.states.find(s => s.id === id));
                if (control) {
                    smartName.smartType = control.type;
                    controls = [control];
                }
            }
            if (!smartName.smartType) {
                // if the upper object is channel or device, try to detect there
                const channelId = getChannelId(id, devicesObject);
                const deviceId = getDeviceId(id, devicesObject);
                const enums = [];
                for (let f = 0; f < functionalities.length; f++) {
                    const functionEnumItem = functionalities[f];
                    const members = functionEnumItem.common.members || [];
                    if (members.includes(id) ||
                        (channelId && members.includes(channelId)) ||
                        (deviceId && members.includes(deviceId))) {
                        enums.push(functionEnumItem._id);
                    }
                }
                // Is it light related?
                if ((0, roleEnumUtils_1.roleOrEnumLight)(devicesObject[id], enums) ||
                    (channelId && (0, roleEnumUtils_1.roleOrEnumLight)(devicesObject[channelId], enums)) ||
                    (deviceId && (0, roleEnumUtils_1.roleOrEnumLight)(devicesObject[deviceId], enums))) {
                    // we will write light
                    if (common.type === 'boolean') {
                        smartName.smartType = type_detector_1.Types.light;
                    }
                    else if (common.type === 'number') {
                        smartName.smartType = type_detector_1.Types.dimmer;
                    }
                }
                else if (common.type === 'number' &&
                    ((0, roleEnumUtils_1.roleOrEnumBlind)(devicesObject[id], enums) ||
                        (channelId && (0, roleEnumUtils_1.roleOrEnumBlind)(devicesObject[channelId], enums)) ||
                        (deviceId && (0, roleEnumUtils_1.roleOrEnumBlind)(devicesObject[deviceId], enums)))) {
                    // we will write blind
                    smartName.smartType = type_detector_1.Types.blind;
                }
                else if (common.type === 'number' &&
                    ((0, roleEnumUtils_1.roleOrEnumWindow)(devicesObject[id], enums) ||
                        (channelId && (0, roleEnumUtils_1.roleOrEnumWindow)(devicesObject[channelId], enums)) ||
                        (deviceId && (0, roleEnumUtils_1.roleOrEnumWindow)(devicesObject[deviceId], enums)))) {
                    // we will write window
                    if (common.type === 'number' && !common.states) {
                        smartName.smartType = type_detector_1.Types.blind;
                    }
                    else if (common.states) {
                        smartName.smartType = type_detector_1.Types.windowTilt; // fallback
                    }
                    else {
                        smartName.smartType = type_detector_1.Types.window;
                    }
                }
                else if (common.type === 'boolean' &&
                    ((0, roleEnumUtils_1.roleOrEnumDoor)(devicesObject[id], enums) ||
                        (channelId && (0, roleEnumUtils_1.roleOrEnumDoor)(devicesObject[channelId], enums)) ||
                        (deviceId && (0, roleEnumUtils_1.roleOrEnumDoor)(devicesObject[deviceId], enums)))) {
                    // we will write door
                    smartName.smartType = type_detector_1.Types.door;
                }
                else if (common.type === 'boolean' &&
                    ((0, roleEnumUtils_1.roleOrEnumGate)(devicesObject[id], enums) ||
                        (channelId && (0, roleEnumUtils_1.roleOrEnumGate)(devicesObject[channelId], enums)) ||
                        (deviceId && (0, roleEnumUtils_1.roleOrEnumGate)(devicesObject[deviceId], enums)))) {
                    // we will write gate
                    smartName.smartType = type_detector_1.Types.gate;
                }
                else {
                    // all booleans are sockets
                    // all numbers are dimmer
                    // string is not possible to control
                    if (common.type === 'boolean' || common.type === 'mixed') {
                        // Try to find out if it in a category with light, lights or lamp, and so on
                        if (common.read === false) {
                            // write socket if writable, but not readable
                            smartName.smartType = type_detector_1.Types.button;
                        }
                        else {
                            // we will write boolean
                            smartName.smartType = type_detector_1.Types.socket;
                        }
                    }
                    else if (common.type === 'number') {
                        smartName.smartType = type_detector_1.Types.slider;
                    }
                    else {
                        smartName.smartType = type_detector_1.Types.socket; // fallback
                    }
                }
            }
        }
        else if (controls?.length) {
            // Try to find suitable control
            const control = controls.find(c => c.type === smartName.smartType);
            if (control) {
                controls = [control];
            }
            else {
                // If the user specified a different type, prefer it
                controls = null;
            }
        }
        // convert alexa2 smartType to alexa 3
        if (smartName.smartType && SMART_TYPES[smartName.smartType]) {
            smartName.smartType = SMART_TYPES[smartName.smartType];
        }
        const pattern = smartName.smartType && Object.keys(patterns).find(p => patterns[p].type === smartName.smartType);
        // try to simulate typeDetector format
        if (smartName.smartType && pattern) {
            const control = controls?.[0] || JSON.parse(JSON.stringify(patterns[pattern]));
            // find first required
            const state = control.states.find(state => state.required || state.requiredOneOf);
            if (state) {
                if (!controls?.[0]) {
                    state.id = id;
                }
                // process control
                // remove all unassigned control register
                control.states = control.states.filter(s => s.id);
                // take all smartNames if any
                control.states.forEach(s => {
                    s.smartName = getSmartNameFromObj(devicesObject[s.id], adapter.namespace, lang, adapter.config.noCommon);
                    s.common = {
                        min: devicesObject[s.id]?.common?.min,
                        max: devicesObject[s.id]?.common?.max,
                        type: devicesObject[s.id]?.common?.type,
                        states: devicesObject[s.id]?.common?.states,
                        role: devicesObject[s.id]?.common?.role,
                        name: devicesObject[s.id]?.common?.name,
                        unit: devicesObject[s.id]?.common?.unit,
                        step: devicesObject[s.id]?.common?.step,
                    };
                });
                devicesObject[id].common.smartName = smartName;
                control.object = {
                    id,
                    type: devicesObject[id].type,
                    common: devicesObject[id].common,
                    autoDetected: false,
                    toggle: smartName?.toggle,
                    typeWasDetected,
                    possibleTypes,
                };
                // remove id from the groups
                let pos = list.indexOf(id);
                if (pos !== -1) {
                    list.splice(pos, 1);
                }
                const channelId = getChannelId(id, devicesObject);
                if (channelId) {
                    pos = list.indexOf(channelId);
                    if (pos !== -1) {
                        list.splice(pos, 1);
                    }
                }
                const name = smartName[lang] || smartName.en || smartName.de;
                control.groupNames = (name?.split(',').map(n => n.trim()) || []).filter(n => n);
                adapter.log.debug(`[ALEXA3] added ${id} with smartName as "${smartName.smartType}"`);
                detectedControls.push(control);
            }
            else {
                // ignored
                adapter.log.debug(`[ALEXA3] Ignored state ${id} with smartName ${JSON.stringify(smartName)} and type ${common.type}`);
            }
        }
        else {
            // ignored
            adapter.log.debug(`[ALEXA3] Ignored state ${id} with smartName ${JSON.stringify(smartName)} and type ${common.type}`);
        }
    }
    options.ignoreEnums = false;
    options.detectAllPossibleDevices = false;
    adapter.log.debug(`[ALEXA3] collected ${detectedControls.length} controls`);
    // go other the list of IDs to inspect and collect the detected controls
    list.forEach(id => {
        options.id = id;
        const parentType = devicesObject[parentOf(id)]?.type;
        options.detectOnlyChannel = parentType === 'channel' || parentType === 'device';
        const controls = detector.detect(options);
        const possibleTypes = controls?.map(c => c.type) || [];
        controls?.forEach(control => {
            const iotControl = control;
            // if any detected state has an ID, we can use this control
            if (iotControl.states.find(state => state.id)) {
                // console.log(`In ${id} was detected "${control.type}" with the following states:`);
                // remove all unassigned control register
                iotControl.states = iotControl.states.filter(s => s.id);
                let smartDisabled = false;
                // take all smartNames if any
                iotControl.states.forEach(s => {
                    s.smartName = getSmartNameFromObj(devicesObject[s.id], adapter.namespace, lang, adapter.config.noCommon);
                    if (s.smartName === false) {
                        smartDisabled = true;
                        adapter.log.debug(`[ALEXA3] Ignored control ${id} with type ${iotControl.type} as disabled`);
                        return;
                    }
                    s.common = {
                        min: devicesObject[s.id]?.common?.min,
                        max: devicesObject[s.id]?.common?.max,
                        type: devicesObject[s.id]?.common?.type,
                        states: devicesObject[s.id]?.common?.states,
                        role: devicesObject[s.id]?.common?.role,
                        name: devicesObject[s.id]?.common?.name,
                        unit: devicesObject[s.id]?.common?.unit,
                        step: devicesObject[s.id]?.common?.step,
                    };
                });
                if (smartDisabled) {
                    // This control is disabled
                    return;
                }
                // find out the room the found control is in
                const room = rooms.find(room => room?.common?.members?.includes(id));
                // find out the functionality the found control assigned to
                const functionality = functionalities.find(functionality => functionality?.common?.members?.includes(id));
                const smartName = getSmartNameFromObj(devicesObject[id], adapter.namespace, lang, adapter.config.noCommon);
                iotControl.object = {
                    id,
                    type: devicesObject[id].type,
                    common: {
                        min: devicesObject[id].common?.min,
                        max: devicesObject[id].common?.max,
                        type: devicesObject[id].common?.type,
                        states: devicesObject[id].common?.states,
                        role: devicesObject[id].common?.role,
                        name: devicesObject[id].common?.name,
                        smartName,
                    },
                    autoDetected: true,
                    toggle: smartName && typeof smartName === 'object' ? smartName.toggle : undefined,
                    possibleTypes,
                    typeWasDetected: true,
                };
                iotControl.room = room
                    ? {
                        id: room._id,
                        common: room.common,
                    }
                    : undefined;
                iotControl.functionality = functionality
                    ? {
                        id: functionality._id,
                        common: functionality.common,
                    }
                    : undefined;
                detectedControls.push(iotControl);
            }
        });
    });
    adapter.log.debug(`[ALEXA3] sorted ${detectedControls.length} controls`);
    return detectedControls;
}
/**
 * Normalizes any provided value with observed min and max to the range 0..100
 *
 * @param value value to be normalized
 * @param min min observed (possible) value
 * @param max max observed (possible) value
 * @param noRound do not round the result
 * @returns Normalized value in the range 0..100 or undefined on invalid input
 */
function normalize_0_100(value, min, max, noRound) {
    if (noRound) {
        return min >= max || value < min || value > max ? undefined : ((value - min) / (max - min)) * 100;
    }
    return min >= max || value < min || value > max ? undefined : Math.round(((value - min) / (max - min)) * 100);
}
/**
 * Normalizes any provided value with observed min and max to the range 0..1
 *
 * @param value value to be normalized
 * @param min min observed (possible) value
 * @param max max observed (possible) value
 * @returns Normalized value in the range 0..100 or undefined on invalid input
 */
function normalize_0_1(value, min, max) {
    return min >= max || value < min || value > max ? undefined : (value - min) / (max - min);
}
/**
 * Denormalizes any provided value from range 0..100 to the min..max range
 *
 * @param normalized normalized value
 * @param min min observed (possible) value
 * @param max max observed (possible) value
 * @param noRound do not round the result
 * @returns Denormalized value in the range min-max
 */
function denormalize_0_100(normalized, min, max, noRound) {
    if (noRound) {
        return min >= max || normalized < 0 || normalized > 100 ? undefined : (normalized / 100) * (max - min) + min;
    }
    return min >= max || normalized < 0 || normalized > 100
        ? undefined
        : Math.round((normalized / 100) * (max - min) + min);
}
/**
 * Denormalizes any provided value from range 0..1 to the min..max range
 *
 * @param normalized normalized value
 * @param min min observed (possible) value
 * @param max max observed (possible) value
 * @param noRound do not round the result
 * @returns Denormalized value in the range min-max
 */
function denormalize_0_1(normalized, min, max, noRound) {
    if (noRound) {
        return min >= max || normalized < 0 || normalized > 1 ? undefined : normalized * (max - min) + min;
    }
    return min >= max || normalized < 0 || normalized > 1 ? undefined : Math.round(normalized * (max - min) + min);
}
/**
 * Returns distinct objects in a list based on values of the provided property name
 *
 * @param list - list of objects
 * @param propertyName - name of the property to build distinct values on, or a function returning the key
 * @param combineValues - if the values should be combined and not just overwritten
 * @returns List containing at most one element per property value
 */
function distinctByPropertyName(list, propertyName, combineValues) {
    const map = new Map();
    for (const item of list) {
        const key = typeof propertyName === 'function' ? propertyName(item) : item[propertyName];
        if (combineValues && map.has(key)) {
            const existing = map.get(key);
            if (existing.value === 'ON' || existing.value === 'OFF') {
                if (item.value === 'ON') {
                    existing.value = item.value;
                }
            }
            else if (isFinite(existing.value) && isFinite(item.value)) {
                existing.value = Math.max(existing.value, item.value);
            }
            continue;
        }
        map.set(key, item);
    }
    return Array.from(map.values());
}
function className(thisToString) {
    const classNameRegEx = /\S+\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/;
    const result = classNameRegEx.exec(thisToString);
    return result?.[1] || 'UnknownClass';
}
/**
 * Updates the provided value if required to fit it into the range 0..100
 */
function ensureValueInRange_0_100(value) {
    return ensureValueInRange(value, 0, 100);
}
/**
 * Updates the provided value if required to fit it into the range min..max
 */
function ensureValueInRange(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function firstLower(input) {
    if (!input || typeof input !== 'string') {
        return input;
    }
    return input[0].toLowerCase() + input.slice(1);
}
function closestFromList(target, list) {
    return list.reduce((prev, curr) => (Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev));
}
function asEnum(values) {
    const enumeration = {};
    for (let i = 0; i < values.length; i++) {
        enumeration[i] = values[i];
        enumeration[values[i]] = i;
    }
    return enumeration;
}
function toHex(x) {
    return x.toString(16).padStart(2, '0');
}
function to255(x) {
    return Math.round(x * 255);
}
/**
 * Converts a color from HAL (Hue, Saturation, Brightness) to RGB hex string
 *
 * @param hal The color in HAL format
 * @param hal.hue The hue (0-360)
 * @param hal.saturation The saturation (0-1)
 * @param hal.brightness The brightness (0-1)
 * @returns The color in RGB hex format (e.g. #ff0000 for red)
 */
function hal2rgb(hal) {
    const hue = hal.hue;
    const saturation = hal.saturation;
    const brightness = hal.brightness;
    let r;
    let g;
    let b;
    const i = Math.floor(hue / 60) % 6;
    const f = hue / 60 - i;
    const p = brightness * (1 - saturation);
    const q = brightness * (1 - f * saturation);
    const t = brightness * (1 - (1 - f) * saturation);
    switch (i) {
        case 0:
            r = brightness;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = brightness;
            b = p;
            break;
        case 2:
            r = p;
            g = brightness;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = brightness;
            break;
        case 4:
            r = t;
            g = p;
            b = brightness;
            break;
        case 5:
            r = brightness;
            g = p;
            b = q;
            break;
        default:
            r = 0;
            g = 0;
            b = 0;
    }
    return `#${toHex(to255(r))}${toHex(to255(g))}${toHex(to255(b))}`;
}
function hal2rgbw(hal) {
    const hue = hal.hue;
    const saturation = hal.saturation;
    const brightness = hal.brightness;
    let r;
    let g;
    let b;
    const i = Math.floor(hue / 60) % 6;
    const f = hue / 60 - i;
    const p = brightness * (1 - saturation);
    const q = brightness * (1 - f * saturation);
    const t = brightness * (1 - (1 - f) * saturation);
    switch (i) {
        case 0:
            r = brightness;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = brightness;
            b = p;
            break;
        case 2:
            r = p;
            g = brightness;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = brightness;
            break;
        case 4:
            r = t;
            g = p;
            b = brightness;
            break;
        case 5:
            r = brightness;
            g = p;
            b = q;
            break;
        default:
            r = 0;
            g = 0;
            b = 0;
    }
    // Extract the common white component (min of R,G,B = p) into the dedicated white channel
    // const w = p;
    // return `#${toHex(to255(r - w))}${toHex(to255(g - w))}${toHex(to255(b - w))}${toHex(to255(w))}`;
    // Simple calculations
    return `#${toHex(to255(r))}${toHex(to255(g))}${toHex(to255(b))}${toHex(to255(255))}`;
}
/**
 * Convert an RGB hex string to HAL (Hue, Saturation, Brightness)
 *
 * @param rgb The color in RGB hex format (e.g. #ff0000 for red)
 * @returns The color in HAL format or null on invalid input
 */
function rgb2hal(rgb) {
    if (!rgb || typeof rgb !== 'string' || !rgb.startsWith('#') || (rgb.length !== 7 && rgb.length !== 4)) {
        return {
            hue: 0,
            saturation: 0,
            brightness: 0,
        };
    }
    let r;
    let g;
    let b;
    if (rgb.length === 7) {
        r = parseInt(rgb.substring(1, 3), 16);
        g = parseInt(rgb.substring(3, 5), 16);
        b = parseInt(rgb.substring(5, 7), 16);
    }
    else {
        r = parseInt(rgb[1] + rgb[1], 16);
        g = parseInt(rgb[2] + rgb[2], 16);
        b = parseInt(rgb[3] + rgb[3], 16);
    }
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h;
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0; // achromatic
    }
    else {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
            default:
                h = 0;
        }
        h /= 6;
    }
    return {
        hue: Math.round(h * 360),
        saturation: parseFloat(s.toFixed(2)),
        brightness: parseFloat(v.toFixed(2)),
    };
}
/** Convert rgb(w)(1-255,1-255,1-255(,0-1)) to hex string */
function rgbwToHex(rgbw) {
    if (!rgbw || typeof rgbw !== 'string') {
        return '#00000000';
    }
    if (rgbw.startsWith('#')) {
        return rgbw;
    }
    if (rgbw.startsWith('rgba(')) {
        rgbw = rgbw.substring(5, rgbw.length - 1);
    }
    else if (rgbw.startsWith('rgb(')) {
        rgbw = rgbw.substring(4, rgbw.length - 1);
    }
    const parts = rgbw.split(',');
    if (parts.length < 3 || parts.length > 4) {
        return '#000000';
    }
    let r = parseInt(parts[0].trim(), 10);
    let g = parseInt(parts[1].trim(), 10);
    let b = parseInt(parts[2].trim(), 10);
    let w = parts.length === 4 ? parseFloat(parts[3].trim()) : 1;
    if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(w)) {
        if (parts.length === 4) {
            return '#00000000';
        }
        return '#000000';
    }
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    w = Math.max(0, Math.min(1, w));
    if (parts.length === 3) {
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(Math.round(w * 255))}`;
}
/**
 * Convert an RGBW hex string to HAL (Hue, Saturation, Brightness)
 *
 * @param rgbw The color in RGB hex format (e.g. #ff0000 for red)
 * @returns The color in HAL format or null on invalid input
 */
function rgbw2hal(rgbw) {
    if (!rgbw || typeof rgbw !== 'string' || !rgbw.startsWith('#') || (rgbw.length !== 9 && rgbw.length !== 5)) {
        return {
            hue: 0,
            saturation: 0,
            brightness: 0,
        };
    }
    let r;
    let g;
    let b;
    let w;
    if (rgbw.length === 9) {
        r = parseInt(rgbw.substring(1, 3), 16);
        g = parseInt(rgbw.substring(3, 5), 16);
        b = parseInt(rgbw.substring(5, 7), 16);
        w = parseInt(rgbw.substring(7, 9), 16);
    }
    else {
        r = parseInt(rgbw[1] + rgbw[1], 16);
        g = parseInt(rgbw[2] + rgbw[2], 16);
        b = parseInt(rgbw[3] + rgbw[3], 16);
        w = parseInt(rgbw[4] + rgbw[4], 16);
    }
    // remove white from RGB
    // r = Math.max(0, r - w);
    // g = Math.max(0, g - w);
    // b = Math.max(0, b - w);
    r /= 255;
    g /= 255;
    b /= 255;
    w /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h;
    const v = Math.max(max, w); // use white channel as brightness if higher
    const d = max - min;
    const s = v === 0 ? 0 : d / v;
    if (max === min) {
        h = 0; // achromatic
    }
    else {
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
            default:
                h = 0;
        }
        h /= 6;
    }
    return {
        hue: Math.round(h * 360),
        saturation: parseFloat(s.toFixed(2)),
        brightness: parseFloat(v.toFixed(2)),
    };
}
//# sourceMappingURL=Utils.js.map