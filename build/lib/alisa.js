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
const type_detector_1 = __importStar(require("@iobroker/type-detector"));
const axios_1 = __importDefault(require("axios"));
const node_crypto_1 = require("node:crypto");
const texts_1 = __importDefault(require("./texts"));
const rooms_1 = __importDefault(require("./rooms"));
const functions_1 = __importDefault(require("./functions"));
const ignoreIds = [/^system\./, /^script\./];
function replaceInvalidChars(name) {
    return name
        .replace(/[^a-zA-Z0-9А-Яа-я_]/g, '_')
        .replace(/Ü/g, 'UE')
        .replace(/Ä/g, 'AE')
        .replace(/Ö/g, 'OE')
        .replace(/ü/g, 'ue')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ß/g, 'ss');
}
const typesMapping = {
    on_off: 'OnOff',
    color_setting: 'RGB',
    'range_unit.percent': 'Brightness',
    'range_unit.temperature.celsius': 'setTargetTemperature',
    'float_temperature_unit.temperature.celsius': 'getActualTemperature',
    'float_temperature_unit.temperature.kelvin': 'getActualTemperature',
    'float_humidity_unit.percent': 'getActualHumidity',
    bool_motion: 'getMotion',
    bool_censor: 'getContact',
};
const URL_STATUS = 'https://20k0wcmzs4.execute-api.eu-west-1.amazonaws.com/default/alisaStatus';
const PROTOCOL_VERSION = 1;
const RETRY_UNKNOWN_DEVICES_INTERVAL = 10 * 60000; // 10 minutes
// Numeric capability instances (range, temperature_k, ...) never carry the HSV object form of
// AlisaCapabilityValue, but the union allows it. Drop that case so the value can be stringified
// for parseFloat/parseInt without ever yielding '[object Object]'.
function numericCapabilityValue(value) {
    return typeof value === 'object' ? '' : String(value);
}
// -----------------------------------------------------------------------------
// Converter
// -----------------------------------------------------------------------------
class YandexAliceConverter {
    lang = 'ru';
    types;
    adapter;
    _entities = [];
    _entity2ID = {};
    _ID2entity = {};
    constructor(adapter) {
        this.adapter = adapter;
        this.types = {
            [type_detector_1.Types.socket]: this._processSocket.bind(this),
            [type_detector_1.Types.light]: this._processLight.bind(this),
            [type_detector_1.Types.dimmer]: this._processDimmer.bind(this),
            [type_detector_1.Types.ct]: this._processCT.bind(this),
            [type_detector_1.Types.rgbSingle]: this._processRGB.bind(this),
            [type_detector_1.Types.airCondition]: this._processAC.bind(this),
            [type_detector_1.Types.thermostat]: this._processAC.bind(this),
            [type_detector_1.Types.blind]: this._processBlinds.bind(this),
            [type_detector_1.Types.lock]: this._processLock.bind(this),
            [type_detector_1.Types.vacuumCleaner]: this._processVacuumCleaner.bind(this),
            [type_detector_1.Types.gate]: this._processLock.bind(this),
            // sensors
            [type_detector_1.Types.motion]: this._processMotion.bind(this),
            [type_detector_1.Types.door]: this._processContact.bind(this),
            [type_detector_1.Types.window]: this._processContact.bind(this),
            [type_detector_1.Types.temperature]: this._processTemperature.bind(this),
            [type_detector_1.Types.humidity]: this._processHumidity.bind(this),
            [type_detector_1.Types.buttonSensor]: this._processButtonSensor.bind(this),
        };
    }
    setLanguage(lang) {
        this.lang = lang || 'ru';
    }
    _getSmartName(obj) {
        if (!this.adapter.config.noCommon) {
            return obj?.common ? obj.common.smartName || '' : '';
        }
        const custom = obj?.common?.custom?.[this.adapter.namespace];
        return custom ? custom.smartName : '';
    }
    _getObjectName(obj, _lang) {
        const lang = _lang || this.lang;
        let result = this._getSmartName(obj);
        if (!result || (typeof result !== 'object' && typeof result !== 'string')) {
            result = obj?.common ? obj.common.name : null;
            result ||= obj._id;
        }
        if (typeof result === 'object') {
            if (result[lang] || result.en) {
                return result[lang] || result.en || '';
            }
            // take first not empty value
            const key = Object.keys(result).find(l => result[l]);
            if (key && result[key]) {
                return result[key];
            }
            return obj._id;
        }
        return result || '';
    }
    _generateName(obj, lang) {
        return this._getObjectName(obj, lang).replace(/[^-._\w0-9А-Яа-яÄÜÖßäöü]/g, '_');
    }
    _addID2entity(id, entity) {
        this._ID2entity[id] = this._ID2entity[id] || [];
        const found = this._ID2entity[id].find(e => e.entity_id === entity.entity_id);
        if (!found) {
            this._ID2entity[id].push(entity);
        }
    }
    // ------------------------------- START OF CONVERTERS ---------------------------------------- //
    async _getStateBooleanProperty(entity, name, mapping) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === name);
        const stateId = attribute ? attribute.getId || attribute.setId : undefined;
        const capability = entity.context.properties.find(cap => cap.type === 'devices.properties.event' && cap.parameters?.instance === name);
        if (capability && stateId) {
            try {
                const state = await this.adapter.getForeignStateAsync(stateId);
                if (state) {
                    const truthy = state.val === 'false' || state.val === '0'
                        ? false
                        : state.val === 'true' ||
                            state.val === true ||
                            state.val === 1 ||
                            state.val === '1' ||
                            !!state.val;
                    capability.state = {
                        instance: name,
                        value: mapping[String(truthy)],
                    };
                }
            }
            catch (e) {
                this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
            }
        }
    }
    async _getStateFloatProperty(entity, name) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === name);
        const stateId = attribute ? attribute.getId || attribute.setId : undefined;
        const capability = entity.context.properties.find(cap => cap.type === 'devices.properties.float' && cap.parameters?.instance === name);
        if (capability && stateId) {
            try {
                const state = await this.adapter.getForeignStateAsync(stateId);
                if (state) {
                    capability.state = {
                        instance: name,
                        value: parseFloat(state.val) || 0,
                    };
                }
            }
            catch (e) {
                this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
            }
        }
    }
    async _getStateNumber(entity, type, name) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === name);
        const stateId = attribute ? attribute.getId || attribute.setId : undefined;
        const capability = entity.context.capabilities.find(cap => cap.type === type && cap.parameters?.instance === name);
        if (!capability || !stateId) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                capability.state = {
                    instance: name,
                    value: parseFloat(state.val) || 0,
                };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStateNumber(entity, data, type, name) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === name);
        const stateId = attribute ? attribute.setId || attribute.getId : undefined;
        const capability = data.capabilities.find(cap => cap.type === type && cap.state?.instance === name);
        if (!capability?.state || !stateId) {
            return data;
        }
        if (capability.state.relative) {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                const val = (parseFloat(state.val) || 0) +
                    parseFloat(numericCapabilityValue(capability.state.value));
                await this.adapter.setForeignStateAsync(stateId, val);
                capability.state.action_result = { status: 'DONE' };
            }
            else {
                capability.state.action_result = {
                    status: 'ERROR',
                    error_code: 'INVALID_VALUE',
                    error_message: 'State has invalid value',
                };
            }
            return data;
        }
        await this.adapter.setForeignStateAsync(stateId, parseFloat(numericCapabilityValue(capability.state.value)));
        capability.state.action_result = { status: 'DONE' };
        return data;
    }
    async _getStateMode(entity, name) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === name);
        const stateId = attribute ? attribute.getId || attribute.setId : undefined;
        const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.mode' && cap.parameters?.instance === name);
        if (!capability || !stateId || !attribute) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                const rawValue = state.val;
                capability.state = {
                    instance: name,
                    value: attribute.states ? (attribute.states[rawValue] || '').toLowerCase() : rawValue,
                };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStateMode(entity, data, name) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === name);
        const stateId = attribute ? attribute.setId || attribute.getId : undefined;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.mode' && cap.state?.instance === name);
        if (!capability?.state || !stateId || !attribute) {
            return data;
        }
        let val = attribute.states
            ? Object.keys(attribute.states).find(v => attribute.states[v].toLowerCase() ===
                String(capability.state.value).toLowerCase())
            : capability.state.value;
        if (attribute.states && attribute.type === 'number' && typeof val === 'string') {
            val = parseInt(val, 10);
        }
        if (val !== undefined) {
            await this.adapter.setForeignStateAsync(stateId, val);
        }
        capability.state.action_result = { status: 'DONE' };
        return data;
    }
    _getStateRange(entity, name) {
        return this._getStateNumber(entity, 'devices.capabilities.range', name);
    }
    _setStateRange(entity, data, name) {
        return this._setStateNumber(entity, data, 'devices.capabilities.range', name);
    }
    async _getStateOnOff(entity) {
        const stateId = entity.STATE.getId;
        const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.on_off');
        if (!capability || !stateId) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                capability.state = {
                    instance: 'on',
                    value: entity.STATE.min !== undefined && entity.STATE.min === state.val
                        ? false
                        : entity.STATE.max !== undefined && entity.STATE.max === state.val
                            ? true
                            : !!state.val,
                };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStateOnOff(entity, data) {
        const stateId = entity.STATE.setId;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.on_off');
        if (!capability?.state || !stateId) {
            return data;
        }
        if (entity.STATE.type === 'number') {
            const value = capability.state.value
                ? entity.STATE.max !== undefined
                    ? entity.STATE.max
                    : 100
                : entity.STATE.min !== undefined
                    ? entity.STATE.min
                    : 0;
            await this.adapter.setForeignStateAsync(stateId, value);
        }
        else {
            // on_off capability: state.value is boolean, but the union allows HSV.
            await this.adapter.setForeignStateAsync(stateId, capability.state.value);
        }
        capability.state.action_result = { status: 'DONE' };
        return data;
    }
    async _setStateLock(entity, data) {
        const stateId = entity.STATE.setId;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.on_off');
        if (!capability?.state || !stateId) {
            return data;
        }
        const onOffValue = capability.state.value;
        if (capability.state.value && entity.STATE.openId) {
            await this.adapter.setForeignStateAsync(entity.STATE.openId, onOffValue);
        }
        else {
            await this.adapter.setForeignStateAsync(stateId, onOffValue);
        }
        capability.state.action_result = { status: 'DONE' };
        return data;
    }
    _getStateBrightness(entity) {
        return this._getStateRange(entity, 'brightness');
    }
    _setStateBrightness(entity, data) {
        return this._setStateRange(entity, data, 'brightness');
    }
    async _getStateCT(entity) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'ct');
        const stateId = attribute ? attribute.getId : undefined;
        const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.color_setting');
        if (!capability || !stateId) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                const val = parseInt(state.val);
                capability.state = { instance: 'temperature_k', value: val };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStateCT(entity, data) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'ct');
        const stateId = attribute ? attribute.getId : undefined;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.color_setting');
        if (capability?.state && stateId && capability.state.instance === 'temperature_k') {
            const val = parseInt(numericCapabilityValue(capability.state.value));
            await this.adapter.setForeignStateAsync(stateId, val);
            capability.state.action_result = { status: 'DONE' };
        }
        return data;
    }
    async _getStateRGB(entity) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'rgb');
        const stateId = attribute ? attribute.getId : undefined;
        const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.color_setting');
        if (!capability || !stateId) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                const val = String(state.val).replace('#', '');
                capability.state = { instance: 'rgb', value: parseInt(val, 16) };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStateRGB(entity, data) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'rgb');
        const stateId = attribute ? attribute.getId : undefined;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.color_setting');
        if (capability?.state && stateId && capability.state.instance === 'rgb') {
            const val = capability.state.value.toString(16).padStart(6, '0');
            await this.adapter.setForeignStateAsync(stateId, `#${val}`);
            capability.state.action_result = { status: 'DONE' };
        }
        return data;
    }
    _getStateTemperature(entity) {
        return this._getStateRange(entity, 'temperature');
    }
    _setStateTemperature(entity, data) {
        return this._setStateRange(entity, data, 'temperature');
    }
    _getStateThermostat(entity) {
        return this._getStateMode(entity, 'thermostat');
    }
    _setStateThermostat(entity, data) {
        return this._setStateMode(entity, data, 'thermostat');
    }
    _getStateSwing(entity) {
        return this._getStateMode(entity, 'swing');
    }
    _setStateSwing(entity, data) {
        return this._setStateMode(entity, data, 'swing');
    }
    _getStateSpeed(entity) {
        return this._getStateMode(entity, 'fan_speed');
    }
    _setStateSpeed(entity, data) {
        return this._setStateMode(entity, data, 'fan_speed');
    }
    async _getStateBlinds(entity) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'open');
        const stateId = attribute ? attribute.getId : undefined;
        const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.range');
        if (!capability || !stateId) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                capability.state = {
                    instance: 'open',
                    value: state.val === true ? 100 : state.val === false ? 0 : state.val === null ? 0 : state.val,
                };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStateBlinds(entity, data) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'open');
        const stateId = attribute ? attribute.setId || attribute.getId : undefined;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.range');
        if (capability?.state && stateId) {
            // range.open: state.value is a number (0..100).
            await this.adapter.setForeignStateAsync(stateId, capability.state.value);
            capability.state.action_result = { status: 'DONE' };
        }
        return data;
    }
    async _getStatePause(entity) {
        const attribute = entity.ATTRIBUTES.find(attr => attr.attribute === 'pause');
        const stateId = attribute ? attribute.getId : undefined;
        const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.toggle');
        if (!capability || !stateId) {
            return;
        }
        try {
            const state = await this.adapter.getForeignStateAsync(stateId);
            if (state) {
                capability.state = {
                    instance: 'pause',
                    value: state.val === true ||
                        state.val === 'true' ||
                        state.val === '1' ||
                        state.val === 1 ||
                        state.val === 'AN' ||
                        state.val === 'ON' ||
                        state.val === 'an' ||
                        state.val === 'on',
                };
            }
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read state ${stateId} for entity ${entity.entity_id}: ${e}`);
        }
    }
    async _setStatePause(entity, data) {
        const stateId = entity.STATE.setId;
        const capability = data.capabilities.find(cap => cap.type === 'devices.capabilities.toggle' && cap.state?.instance === 'pause');
        if (capability?.state && stateId) {
            await this.adapter.setForeignStateAsync(stateId, capability.state.value === true || capability.state.value === 'true');
            capability.state.action_result = { status: 'DONE' };
        }
        return data;
    }
    _getStateVacuumMode(entity) {
        return this._getStateMode(entity, 'cleanup_mode');
    }
    _setStateVacuumMode(entity, data) {
        return this._setStateMode(entity, data, 'cleanup_mode');
    }
    _getStateVacuumWorkMode(entity) {
        return this._getStateMode(entity, 'work_speed');
    }
    _setStateVacuumWorkMode(entity, data) {
        return this._setStateMode(entity, data, 'work_speed');
    }
    _getStateFloat(entity, name) {
        return this._getStateNumber(entity, 'devices.properties.float', name);
    }
    _processCommon(_id, name, room, func, obj, entityType, entity_id) {
        let displayName = name;
        if (!displayName) {
            if (func && room) {
                displayName = `${room} ${func}`;
            }
            else {
                const custom = obj.common?.custom?.[this.adapter.namespace];
                displayName = custom?.name || this._generateName(obj);
            }
        }
        const _name = replaceInvalidChars(this._generateName(obj, 'en'));
        const entity = {
            entity_id: entity_id || `${entityType}.${_name}`,
            attributes: {
                friendly_name: displayName,
            },
            context: {
                id: obj._id,
                type: entityType,
                name: displayName,
                description: displayName,
                room: room,
                custom_data: {
                    entity_id: entity_id || `${entityType}.${_name}`,
                },
                capabilities: [],
                properties: [],
                device_info: {
                    manufacturer: 'IOBroker',
                    model: entity_id || `${entityType}.${_name}`,
                    hw_version: '',
                    sw_version: this.adapter.version || '',
                },
            },
            COMMANDS: {},
            ATTRIBUTES: [],
            STATE: { setId: null, getId: null },
        };
        if (obj.common.unit) {
            entity.attributes.unit_of_measurement = obj.common.unit;
        }
        this._ID2entity[obj._id] = this._ID2entity[obj._id] || [];
        this._ID2entity[obj._id].push(entity);
        this._entity2ID[entity.entity_id] = entity;
        this._entities.push(entity);
        return entity;
    }
    _processSocket(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.switch');
        let state = control.states.find(s => s.id && s.name === 'SET');
        if (state?.id) {
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            entity.STATE.type = objects[state.id]?.common?.type;
            entity.attributes.icon = 'mdi:power-socket-eu';
            this._addID2entity(state.id, entity);
        }
        state = control.states.find(s => s.id && s.name === 'ACTUAL');
        if (state?.id) {
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        entity.context.capabilities.push({
            type: 'devices.capabilities.on_off',
            retrievable: true,
        });
        entity.COMMANDS.get_state = e => this._getStateOnOff(e);
        entity.COMMANDS.set_state = (e, d) => this._setStateOnOff(e, d);
        return entity;
    }
    _processLight(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.light');
        let state = control.states.find(s => s.id && ['ON_SET', 'ON', 'SET'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            entity.STATE.type = common?.type;
            entity.STATE.min = common?.min;
            entity.STATE.max = common?.max;
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        state = control.states.find(s => s.id && s.name === 'ACTUAL');
        if (state?.id) {
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        entity.context.capabilities.push({
            type: 'devices.capabilities.on_off',
            retrievable: true,
        });
        entity.COMMANDS.get_state = e => this._getStateOnOff(e);
        entity.COMMANDS.set_state = (e, d) => this._setStateOnOff(e, d);
        return entity;
    }
    _processDimmer(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.light');
        let state = control.states.find(s => s.id && ['ON_SET', 'ON'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            entity.STATE.type = common?.type;
            entity.STATE.min = common?.min;
            entity.STATE.max = common?.max;
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        state = control.states.find(s => s.id && s.name === 'ON_ACTUAL');
        if (state?.id) {
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        let getDimmer;
        state = control.states.find(s => s.id && s.name === 'ACTUAL');
        if (state?.id) {
            getDimmer = state.id;
        }
        state = control.states.find(s => s.id && ['DIMMER', 'SET', 'BRIGHTNESS'].includes(s.name));
        let setDimmer = '';
        if (state?.id) {
            setDimmer = state.id;
            entity.ATTRIBUTES.push({
                attribute: 'brightness',
                getId: getDimmer || setDimmer,
                setId: setDimmer,
                type: objects[setDimmer]?.common?.type,
            });
            this._addID2entity(state.id, entity);
        }
        else if (getDimmer) {
            entity.ATTRIBUTES.push({
                attribute: 'brightness',
                getId: getDimmer,
                setId: null,
                type: objects[getDimmer]?.common?.type,
            });
            this._addID2entity(getDimmer, entity);
        }
        if (entity.STATE.getId) {
            entity.context.capabilities.push({
                type: 'devices.capabilities.on_off',
                retrievable: true,
            });
        }
        if (getDimmer || setDimmer) {
            const dimmerCommon = (getDimmer ? objects[getDimmer]?.common : undefined);
            entity.context.capabilities.push({
                type: 'devices.capabilities.range',
                retrievable: !!getDimmer,
                parameters: {
                    instance: 'brightness',
                    random_access: true,
                    unit: 'unit.percent',
                    range: {
                        min: dimmerCommon?.min !== undefined ? dimmerCommon.min : 0,
                        max: dimmerCommon?.max !== undefined ? dimmerCommon.max : 100,
                        precision: 1,
                    },
                },
            });
        }
        entity.COMMANDS.get_state = async (e) => {
            await this._getStateOnOff(e);
            await this._getStateBrightness(e);
        };
        entity.COMMANDS.set_state = async (e, d) => {
            const res = await this._setStateOnOff(e, d);
            return this._setStateBrightness(e, res);
        };
        return entity;
    }
    _processCT(id, control, name, room, func, _obj, objects) {
        const entity = this._processDimmer(id, control, name, room, func, _obj, objects);
        const ctState = control.states.find(s => s.id && ['TEMPERATURE'].includes(s.name));
        if (ctState && ctState.id) {
            const common = objects[ctState.id]?.common;
            entity.ATTRIBUTES.push({
                attribute: 'ct',
                getId: ctState.id,
                setId: ctState.id,
                type: common?.type,
                min: common?.min,
                max: common?.max,
            });
            this._addID2entity(ctState.id, entity);
            entity.context.capabilities.push({
                type: 'devices.capabilities.color_setting',
                retrievable: true,
                parameters: {
                    temperature_k: {
                        min: common?.min || 2700,
                        max: common?.max || 9000,
                        precision: 100,
                    },
                },
            });
            const get_state = entity.COMMANDS.get_state;
            const set_state = entity.COMMANDS.set_state;
            entity.COMMANDS.get_state = async (e) => {
                await get_state(e);
                await this._getStateCT(e);
            };
            entity.COMMANDS.set_state = async (e, d) => {
                const data = await set_state(e, d);
                return this._setStateCT(e, data);
            };
        }
        return entity;
    }
    _processAC(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, control.type === type_detector_1.Types.thermostat ? 'devices.types.thermostat' : 'devices.types.thermostat.ac');
        let state = control.states.find(s => s.id && ['POWER', 'ON'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            entity.STATE.type = common?.type;
            entity.STATE.min = common?.min;
            entity.STATE.max = common?.max;
            this._addID2entity(state.id, entity);
        }
        if (entity.STATE.getId) {
            entity.context.capabilities.push({
                type: 'devices.capabilities.on_off',
                retrievable: true,
            });
        }
        let getTemperature;
        state = control.states.find(s => s.id && s.name === 'ACTUAL');
        if (state?.id) {
            getTemperature = state.id;
        }
        state = control.states.find(s => s.id && ['SET'].includes(s.name));
        let setTemperature = '';
        if (state?.id) {
            setTemperature = state.id;
            entity.ATTRIBUTES.push({
                attribute: 'temperature',
                getId: getTemperature || setTemperature,
                setId: setTemperature,
                type: objects[setTemperature]?.common?.type,
            });
            this._addID2entity(state.id, entity);
        }
        else if (getTemperature) {
            entity.ATTRIBUTES.push({
                attribute: 'temperature',
                getId: getTemperature,
                setId: null,
                type: objects[getTemperature]?.common?.type,
            });
            // NOTE: original JS referenced state.id here which is undefined when entering this branch;
            // calling _addID2entity with the actual getTemperature is the intended behavior.
            this._addID2entity(getTemperature, entity);
        }
        if (getTemperature || setTemperature) {
            const setCommon = (setTemperature ? objects[setTemperature]?.common : undefined);
            entity.context.capabilities.push({
                type: 'devices.capabilities.range',
                retrievable: true,
                parameters: {
                    instance: 'temperature',
                    random_access: true,
                    unit: 'unit.temperature.celsius',
                    range: {
                        min: setCommon?.min !== undefined ? setCommon.min : 12,
                        max: setCommon?.max !== undefined ? setCommon.max : 30,
                        precision: 1,
                    },
                },
            });
        }
        // mode: thermostat
        state = control.states.find(s => s.id && ['MODE'].includes(s.name));
        if (state?.id) {
            const thermostatId = state.id;
            const common = objects[thermostatId]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'thermostat',
                getId: thermostatId,
                setId: thermostatId,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            const modes = [];
            const values = Object.values(states).map(n => n.toLowerCase());
            ['auto', 'cool', 'dry', 'eco', 'fan_only', 'heat'].forEach(v => {
                if (values.includes(v)) {
                    modes.push({ value: v });
                }
            });
            entity.context.capabilities.push({
                type: 'devices.capabilities.mode',
                retrievable: true,
                parameters: { instance: 'thermostat', modes },
            });
        }
        // mode: swing
        state = control.states.find(s => s.id && ['SWING'].includes(s.name));
        if (state?.id) {
            const swingId = state.id;
            const common = objects[swingId]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'swing',
                getId: swingId,
                setId: swingId,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            const modes = [];
            const values = Object.values(states).map(n => n.toLowerCase());
            ['auto', 'horizontal', 'stationary', 'vertical'].forEach(v => {
                if (values.includes(v)) {
                    modes.push({ value: v });
                }
            });
            entity.context.capabilities.push({
                type: 'devices.capabilities.mode',
                retrievable: true,
                parameters: { instance: 'swing', modes },
            });
        }
        // mode: fan_speed
        state = control.states.find(s => s.id && ['SPEED'].includes(s.name));
        if (state?.id) {
            const fanSpeedId = state.id;
            const common = objects[fanSpeedId]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'fan_speed',
                getId: fanSpeedId,
                setId: fanSpeedId,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            const modes = [];
            const values = Object.values(states).map(n => n.toLowerCase());
            ['auto', 'high', 'low', 'medium', 'quiet', 'turbo'].forEach(v => {
                if (values.includes(v)) {
                    modes.push({ value: v });
                }
            });
            entity.context.capabilities.push({
                type: 'devices.capabilities.mode',
                retrievable: true,
                parameters: { instance: 'fan_speed', modes },
            });
        }
        entity.COMMANDS.get_state = async (e) => {
            await this._getStateOnOff(e);
            await this._getStateTemperature(e);
            await this._getStateThermostat(e);
            await this._getStateSwing(e);
            await this._getStateSpeed(e);
        };
        entity.COMMANDS.set_state = async (e, d) => {
            let res = await this._setStateOnOff(e, d);
            res = await this._setStateTemperature(e, res);
            res = await this._setStateThermostat(e, res);
            res = await this._setStateSwing(e, res);
            return this._setStateSpeed(e, res);
        };
        return entity;
    }
    _processRGB(id, control, name, room, func, _obj, objects) {
        const entity = this._processDimmer(id, control, name, room, func, _obj, objects);
        const rgbState = control.states.find(s => s.id && ['RGB'].includes(s.name));
        if (rgbState && rgbState.id) {
            const common = objects[rgbState.id]?.common;
            entity.ATTRIBUTES.push({
                attribute: 'rgb',
                getId: rgbState.id,
                setId: rgbState.id,
                type: common?.type,
                min: common?.min,
                max: common?.max,
            });
            this._addID2entity(rgbState.id, entity);
            const capability = entity.context.capabilities.find(cap => cap.type === 'devices.capabilities.color_setting');
            if (!capability) {
                entity.context.capabilities.push({
                    type: 'devices.capabilities.color_setting',
                    retrievable: true,
                    parameters: { color_model: 'rgb' },
                });
            }
            else {
                capability.parameters ||= {};
                capability.parameters.color_model = 'rgb';
            }
            const get_state = entity.COMMANDS.get_state;
            const set_state = entity.COMMANDS.set_state;
            entity.COMMANDS.get_state = async (e) => {
                await get_state(e);
                await this._getStateRGB(e);
            };
            entity.COMMANDS.set_state = async (e, d) => {
                const data = await set_state(e, d);
                return this._setStateRGB(e, data);
            };
        }
        return entity;
    }
    _processBlinds(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.openable.curtain');
        let state = control.states.find(s => s.id && ['SET'].includes(s.name));
        if (state?.id && objects[state.id]?.common?.type === 'boolean') {
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            entity.STATE.type = 'boolean';
            this._addID2entity(state.id, entity);
        }
        state = control.states.find(s => s.id && s.name === 'ACTUAL');
        if (state?.id && objects[state.id]?.common?.type === 'boolean') {
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        if (entity.STATE.getId) {
            entity.context.capabilities.push({
                type: 'devices.capabilities.on_off',
                retrievable: true,
            });
        }
        state = control.states.find(s => s.id && ['SET'].includes(s.name));
        if (state?.id && objects[state.id]?.common?.type === 'number') {
            const blindId = state.id;
            const common = objects[blindId]?.common;
            const attribute = {
                attribute: 'open',
                getId: blindId,
                setId: blindId,
                type: 'number',
                min: common?.min !== undefined ? common.min : 0,
                max: common?.max !== undefined ? common.max : 100,
            };
            entity.ATTRIBUTES.push(attribute);
            this._addID2entity(blindId, entity);
            const getState = control.states.find(s => s.id && s.name === 'ACTUAL');
            if (getState && getState.id && objects[getState.id]?.common?.type === 'number') {
                attribute.getId = getState.id;
                this._addID2entity(getState.id, entity);
            }
            entity.context.capabilities.push({
                type: 'devices.capabilities.range',
                retrievable: true,
                parameters: {
                    instance: 'open',
                    random_access: true,
                    unit: 'unit.percent',
                    range: {
                        min: common?.min !== undefined ? common.min : 0,
                        max: common?.max !== undefined ? common.max : 100,
                        precision: 1,
                    },
                },
            });
            if (!entity.STATE.getId) {
                entity.STATE.setId = state.id;
                entity.STATE.getId = getState ? getState.id : state.id;
                entity.STATE.type = 'number';
                entity.context.capabilities.push({
                    type: 'devices.capabilities.on_off',
                    retrievable: true,
                });
            }
        }
        entity.COMMANDS.get_state = async (e) => {
            await this._getStateOnOff(e);
            await this._getStateBlinds(e);
        };
        entity.COMMANDS.set_state = async (e, d) => {
            const res = await this._setStateOnOff(e, d);
            return this._setStateBlinds(e, res);
        };
        return entity;
    }
    _processLock(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.openable');
        let state = control.states.find(s => s.id && ['SET'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            entity.STATE.type = common?.type;
            entity.STATE.min = common?.min;
            entity.STATE.max = common?.max;
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        state = control.states.find(s => s.id && s.name === 'ACTUAL');
        if (state?.id) {
            entity.STATE.getId = state.id;
            this._addID2entity(state.id, entity);
        }
        state = control.states.find(s => s.id && s.name === 'OPEN');
        if (state?.id) {
            entity.STATE.openId = state.id;
            this._addID2entity(state.id, entity);
        }
        if (entity.STATE.getId) {
            entity.context.capabilities.push({
                type: 'devices.capabilities.on_off',
                retrievable: true,
            });
        }
        entity.COMMANDS.get_state = e => this._getStateOnOff(e);
        entity.COMMANDS.set_state = (e, d) => this._setStateLock(e, d);
        return entity;
    }
    _processVacuumCleaner(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.vacuum_cleaner');
        let state = control.states.find(s => s.id && ['POWER'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            entity.STATE.setId = state.id;
            entity.STATE.getId = state.id;
            entity.STATE.type = common?.type;
            entity.STATE.min = common?.min;
            entity.STATE.max = common?.max;
            this._addID2entity(state.id, entity);
        }
        if (entity.STATE.getId) {
            entity.context.capabilities.push({
                type: 'devices.capabilities.on_off',
                retrievable: true,
            });
        }
        // mode: cleanup_mode
        state = control.states.find(s => s.id && ['MODE'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'cleanup_mode',
                getId: state.id,
                setId: state.id,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            const modes = [];
            const values = Object.values(states).map(n => n.toLowerCase());
            ['auto', 'eco', 'express', 'normal', 'quiet'].forEach(v => {
                if (values.includes(v)) {
                    modes.push({ value: v });
                }
            });
            entity.context.capabilities.push({
                type: 'devices.capabilities.mode',
                retrievable: true,
                parameters: { instance: 'cleanup_mode', modes },
            });
        }
        // mode: work_speed
        state = control.states.find(s => s.id && ['WORK_MODE'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'work_speed',
                getId: state.id,
                setId: state.id,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            const modes = [];
            const values = Object.values(states).map(n => n.toLowerCase());
            ['auto', 'fast', 'medium', 'slow', 'turbo'].forEach(v => {
                if (values.includes(v)) {
                    modes.push({ value: v });
                }
            });
            entity.context.capabilities.push({
                type: 'devices.capabilities.mode',
                retrievable: true,
                parameters: { instance: 'work_speed', modes },
            });
        }
        // toggle: pause
        state = control.states.find(s => s.id && ['PAUSE'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'pause',
                getId: state.id,
                setId: state.id,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            entity.context.capabilities.push({
                type: 'devices.capabilities.toggle',
                retrievable: true,
                parameters: { instance: 'pause' },
            });
        }
        // float: water_level
        state = control.states.find(s => s.id && ['WATER'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'water_level',
                getId: state.id,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            entity.context.capabilities.push({
                type: 'devices.capabilities.float',
                retrievable: true,
                parameters: { instance: 'water_level', unit: 'unit.percent' },
            });
        }
        // float: battery_level
        state = control.states.find(s => s.id && ['BATTERY'].includes(s.name));
        if (state?.id) {
            const common = objects[state.id]?.common;
            const states = common?.states || {};
            entity.ATTRIBUTES.push({
                attribute: 'battery_level',
                getId: state.id,
                states,
                type: common?.type,
            });
            this._addID2entity(state.id, entity);
            entity.context.capabilities.push({
                type: 'devices.capabilities.float',
                retrievable: true,
                parameters: { instance: 'battery_level', unit: 'unit.percent' },
            });
        }
        entity.COMMANDS.get_state = async (e) => {
            await this._getStateOnOff(e);
            await this._getStateVacuumMode(e);
            await this._getStateVacuumWorkMode(e);
            await this._getStatePause(e);
            await this._getStateFloat(e, 'water_level');
            await this._getStateFloat(e, 'battery_level');
        };
        entity.COMMANDS.set_state = async (e, d) => {
            let res = await this._setStateOnOff(e, d);
            res = await this._setStatePause(e, res);
            res = await this._setStateVacuumMode(e, res);
            return this._setStateVacuumWorkMode(e, res);
        };
        return entity;
    }
    _processTemperature(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.sensor');
        let state = control.states.find(s => s.id && ['ACTUAL'].includes(s.name));
        const temperatureId = state?.id;
        if (temperatureId && objects[temperatureId]?.common?.type === 'number') {
            const common = objects[temperatureId].common;
            entity.STATE.getId = temperatureId;
            entity.STATE.type = 'number';
            this._addID2entity(temperatureId, entity);
            entity.ATTRIBUTES.push({
                attribute: 'temperature',
                getId: temperatureId,
                type: 'number',
            });
            entity.context.properties.push({
                type: 'devices.properties.float',
                retrievable: true,
                parameters: {
                    instance: 'temperature',
                    unit: common.unit === '°K' || common.unit === 'K' || common.unit === 'K°'
                        ? 'unit.temperature.kelvin'
                        : 'unit.temperature.celsius',
                },
            });
        }
        state = control.states.find(s => s.id && ['SECOND'].includes(s.name));
        const humidityId = state?.id;
        if (humidityId && objects[humidityId]?.common?.type === 'number') {
            entity.ATTRIBUTES.push({
                attribute: 'humidity',
                getId: humidityId,
                type: 'number',
            });
            this._addID2entity(humidityId, entity);
            entity.context.properties.push({
                type: 'devices.properties.float',
                retrievable: true,
                parameters: { instance: 'humidity', unit: 'unit.percent' },
            });
        }
        entity.COMMANDS.get_state = async (e) => {
            await this._getStateFloatProperty(e, 'temperature');
            await this._getStateFloatProperty(e, 'humidity');
        };
        return entity;
    }
    _processHumidity(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.sensor');
        const state = control.states.find(s => s.id && ['ACTUAL'].includes(s.name));
        const humidityId = state?.id;
        if (humidityId && objects[humidityId]?.common?.type === 'number') {
            entity.STATE.getId = humidityId;
            entity.STATE.type = 'number';
            this._addID2entity(humidityId, entity);
            entity.ATTRIBUTES.push({
                attribute: 'humidity',
                getId: humidityId,
                type: 'number',
            });
            entity.context.properties.push({
                type: 'devices.properties.float',
                retrievable: true,
                parameters: { instance: 'humidity', unit: 'unit.percent' },
            });
        }
        entity.COMMANDS.get_state = e => this._getStateFloatProperty(e, 'humidity');
        return entity;
    }
    _processMotion(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.sensor');
        const state = control.states.find(s => s.id && ['ACTUAL'].includes(s.name));
        const motionId = state?.id;
        if (motionId && objects[motionId]?.common?.type === 'boolean') {
            entity.STATE.getId = motionId;
            entity.STATE.type = 'boolean';
            this._addID2entity(motionId, entity);
            entity.ATTRIBUTES.push({
                attribute: 'motion',
                getId: motionId,
                type: 'number',
            });
            entity.context.properties.push({
                type: 'devices.properties.event',
                retrievable: true,
                parameters: {
                    instance: 'motion',
                    events: [{ value: 'detected' }, { value: 'not_detected' }],
                },
            });
        }
        entity.COMMANDS.get_state = e => this._getStateBooleanProperty(e, 'motion', { true: 'detected', false: 'not_detected' });
        return entity;
    }
    _processContact(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.sensor');
        const state = control.states.find(s => s.id && ['ACTUAL'].includes(s.name));
        const contactId = state?.id;
        if (contactId && objects[contactId]?.common?.type === 'boolean') {
            entity.STATE.getId = contactId;
            entity.STATE.type = 'boolean';
            this._addID2entity(contactId, entity);
            entity.ATTRIBUTES.push({
                attribute: 'open',
                getId: contactId,
                type: 'number',
            });
            entity.context.properties.push({
                type: 'devices.properties.event',
                retrievable: true,
                parameters: {
                    instance: 'open',
                    events: [{ value: 'opened' }, { value: 'closed' }],
                },
            });
        }
        entity.COMMANDS.get_state = e => this._getStateBooleanProperty(e, 'open', { true: 'closed', false: 'opened' });
        return entity;
    }
    _processButtonSensor(id, control, name, room, func, _obj, objects) {
        const entity = this._processCommon(id, name, room, func, _obj, 'devices.types.sensor');
        const state = control.states.find(s => s.id && ['PRESS'].includes(s.name));
        const buttonId = state?.id;
        if (buttonId && objects[buttonId]?.common?.type === 'boolean') {
            entity.STATE.getId = buttonId;
            entity.STATE.type = 'string';
            this._addID2entity(buttonId, entity);
            entity.ATTRIBUTES.push({
                attribute: 'button',
                getId: buttonId,
                type: 'boolean',
            });
            entity.context.properties.push({
                type: 'devices.properties.event',
                retrievable: true,
                parameters: {
                    instance: 'button',
                    events: [{ value: 'click' }, { value: 'double_click' }, { value: 'long_press' }],
                },
            });
        }
        entity.COMMANDS.get_state = e => this._getStateBooleanProperty(e, 'button', { true: 'click' });
        return entity;
    }
}
// -----------------------------------------------------------------------------
// YandexAlisa
// -----------------------------------------------------------------------------
class YandexAlisa {
    adapter;
    lang = 'ru';
    urlKey;
    user_id;
    smartDevices = [];
    enums = [];
    usedIds = [];
    keys = [];
    detector;
    unknownDevices = {};
    rateCalculation = [];
    converter;
    keyPromise;
    keyPromiseTime = 0;
    urlKeyOk = false;
    constructor(adapter, urlKey) {
        this.adapter = adapter;
        this.urlKey = urlKey ?? undefined;
        this.user_id = adapter.config.login.replace(/[^-_:a-zA-Z1-9]/g, '_');
        this.detector = new type_detector_1.default();
        this.converter = new YandexAliceConverter(adapter);
    }
    collectSubscribedIds() {
        const ids = [];
        this.smartDevices?.forEach(device => device.ATTRIBUTES.forEach(item => {
            if (item?.getId && !ids.includes(item.getId)) {
                ids.push(item.getId);
            }
        }));
        return ids;
    }
    async unsubscribeAllIds() {
        const ids = this.collectSubscribedIds();
        this.adapter.log.debug(`[ALISA] Unsubscribe ${ids.length} states for Alisa`);
        for (const id of ids) {
            try {
                await this.adapter.unsubscribeForeignStatesAsync(id);
            }
            catch (e) {
                this.adapter.log.warn(`[ALISA] Cannot unsubscribe ${id}: ${e}`);
            }
        }
        this.adapter.log.debug('[ALISA] Unsubscribe done');
    }
    async subscribeAllIds() {
        const ids = this.collectSubscribedIds();
        this.adapter.log.debug(`[ALISA] Subscribe ${ids.length} states for Alisa`);
        for (const id of ids) {
            try {
                await this.adapter.subscribeForeignStatesAsync(id);
            }
            catch (e) {
                this.adapter.log.warn(`[ALISA] Cannot subscribe ${id}: ${e}`);
            }
        }
        this.adapter.log.debug('[ALISA] Subscribe done');
    }
    getObjectName(obj) {
        let name = '';
        let smartName;
        if (this.adapter.config.noCommon) {
            const custom = obj.common?.custom?.[this.adapter.namespace];
            if (custom?.smartName && custom.smartName !== 'ignore') {
                smartName = custom.smartName;
            }
        }
        else {
            const sn = obj.common?.smartName;
            if (sn && sn !== 'ignore') {
                smartName = sn;
            }
        }
        if (!smartName && obj?.common?.name) {
            name = obj.common.name;
        }
        if (name && typeof name === 'object') {
            name = name[this.lang] || name.en;
        }
        if (!name && obj) {
            name = obj._id.split('.').pop() || '';
        }
        return name;
    }
    checkName(name, obj, room, func) {
        if (!name) {
            name = this.getObjectName(obj);
            name = name.replace(/[^a-zA-ZöäüßÖÄÜа-яА-Я0-9]/g, ' ');
            const _name = name.toLowerCase();
            let pos;
            if (room) {
                pos = _name.indexOf(room.toLowerCase());
                if (pos !== -1) {
                    name = name.substring(0, pos) + name.substring(pos + room.length + 1);
                }
            }
            if (func) {
                pos = _name.indexOf(func.toLowerCase());
                if (pos !== -1) {
                    name = name.substring(0, pos) + name.substring(pos + func.length + 1);
                }
            }
            name = name.replace(/\s\s/g, ' ').replace(/\s\s/g, ' ').trim();
        }
        return name;
    }
    setLanguage(_lang) {
        this.lang = _lang || 'ru';
        this.converter.setLanguage(this.lang);
    }
    getSmartName(states, id) {
        if (!id) {
            const obj = states;
            if (!this.adapter.config.noCommon) {
                return obj.common?.smartName;
            }
            const custom = obj.common?.custom?.[this.adapter.namespace];
            return custom ? custom.smartName : undefined;
        }
        const objects = states;
        if (!this.adapter.config.noCommon) {
            return objects[id]?.common ? objects[id].common.smartName : null;
        }
        const custom = objects[id]?.common?.custom?.[this.adapter.namespace];
        return custom ? custom.smartName : null;
    }
    processState(ids, objects, id, roomName, funcName, result) {
        if (!id) {
            return;
        }
        let friendlyName = this.getSmartName(objects, id);
        if (typeof friendlyName === 'object' && friendlyName) {
            friendlyName = friendlyName[this.lang] || friendlyName.en;
        }
        if (friendlyName === 'ignore' || friendlyName === false) {
            return;
        }
        if (!friendlyName && !roomName && !funcName) {
            return;
        }
        try {
            const options = {
                objects,
                id,
                _keysOptional: ids,
                _usedIdsOptional: this.usedIds || undefined,
            };
            const controls = this.detector.detect(options);
            if (controls) {
                controls.forEach(control => {
                    const fn = this.converter.types[control.type];
                    if (fn) {
                        const entity = fn(id, control, friendlyName, roomName, funcName, objects[id], objects);
                        if (!entity) {
                            return;
                        }
                        const exists = result.find(e => e.entity_id === entity.entity_id);
                        if (exists) {
                            console.log(`Duplicates found for ${entity.entity_id}`);
                            return;
                        }
                        result.push(entity);
                        this.adapter.log.debug(`[ALISA] Created Yandex Alice device: ${entity.entity_id} - ${control.type} - ${id}`);
                    }
                });
            }
            else {
                console.log(`[ALISA] Nothing found for ${options.id}`);
            }
        }
        catch (e) {
            this.adapter.log.error(`[ALISA] Cannot process "${id}": ${e}`);
        }
    }
    async _readObjects() {
        const [states, channels, devices, enumsView] = await Promise.all([
            this.adapter.getObjectViewAsync('system', 'state', {}),
            this.adapter.getObjectViewAsync('system', 'channel', {}),
            this.adapter.getObjectViewAsync('system', 'device', {}),
            this.adapter.getObjectViewAsync('system', 'enum', {}),
        ]);
        const objects = {};
        const enums = {};
        const pushRows = (rows) => {
            if (!rows) {
                return;
            }
            for (const row of rows) {
                const v = row?.value;
                if (v?._id && !ignoreIds.find(reg => reg.test(v._id))) {
                    objects[v._id] = v;
                }
            }
        };
        pushRows(devices?.rows);
        pushRows(channels?.rows);
        pushRows(states?.rows);
        if (enumsView?.rows) {
            for (const row of enumsView.rows) {
                const v = row?.value;
                if (v?._id) {
                    enums[v._id] = v;
                    objects[v._id] = v;
                }
            }
        }
        return { objects, enums };
    }
    async updateDevices(cb) {
        try {
            await this.unsubscribeAllIds();
            this.smartDevices = await this._updateDevices();
            this.adapter.log.debug(`[ALISA] SmartDevices: ${JSON.stringify(this.smartDevices)}`);
            try {
                await this.checkUrlKey();
                await this.subscribeAllIds();
            }
            catch (err) {
                if (this.adapter.config.yandexAlisa) {
                    this.adapter.log.warn(`[ALISA] Invalid URL Pro key. Status auto-update is disabled you can set states but receive states only manually: ${err}`);
                }
            }
        }
        finally {
            cb?.();
        }
    }
    getDevices() {
        const result = this.smartDevices.map(device => ({
            name: device.attributes.friendly_name,
            main: { getId: device.STATE.getId, setId: device.STATE.setId },
            attributes: device.ATTRIBUTES
                ? device.ATTRIBUTES.map(a => ({ name: a.attribute, getId: a.getId, setId: a.setId }))
                : [],
            actions: device.context.capabilities.length
                ? device.context.capabilities.map(cap => {
                    const capText = cap.type.replace('devices.capabilities.', '');
                    const capTextUnit = capText + (cap.parameters?.unit ? `_${cap.parameters.unit}` : '');
                    if (!typesMapping[capTextUnit]) {
                        this.adapter.log.debug(`[ALISA] No mapping found for ${capTextUnit}`);
                    }
                    return typesMapping[capTextUnit] || capText;
                })
                : device.context.properties.map(cap => {
                    const capText = cap.type.replace('devices.properties.', '');
                    const capTextUnit = `${capText}_${cap.parameters?.instance}${cap.parameters?.unit ? `_${cap.parameters.unit}` : ''}`;
                    if (!typesMapping[capTextUnit]) {
                        this.adapter.log.debug(`[ALISA] No mapping found for ${capTextUnit}`);
                    }
                    return typesMapping[capTextUnit] || capText;
                }),
            iobID: device.context.id,
            description: device.context.description,
            room: device.context.room,
            func: device.context.type.replace('devices.types.', '').toUpperCase(),
        }));
        this.adapter.log.debug(`[ALISA] Devices: ${JSON.stringify(result)}`);
        return result;
    }
    async getAll() {
        this.smartDevices = await this._updateDevices();
        this.adapter.log.debug(`[ALISA] SmartDevices: ${JSON.stringify(this.smartDevices)}`);
    }
    async _getSmartDeviceData(entity) {
        if (!entity.context) {
            return undefined;
        }
        if (entity.COMMANDS?.get_state) {
            await entity.COMMANDS.get_state(entity);
        }
        return entity.context;
    }
    _getSmartDeviceState(context) {
        const result = {
            id: context?.id ?? '',
        };
        if (context?.capabilities?.length) {
            const caps = [];
            for (const c of context.capabilities) {
                if (c.state) {
                    caps.push({ type: c.type, state: c.state });
                }
            }
            if (caps.length) {
                result.capabilities = caps;
            }
        }
        if (context?.properties?.length) {
            const props = [];
            for (const c of context.properties) {
                if (c.state) {
                    props.push({ type: c.type, state: c.state });
                }
            }
            if (props.length) {
                result.properties = props;
            }
        }
        return result;
    }
    async getSmartDevices() {
        await this.getAll();
        return Promise.all(this.smartDevices.map(entity => this._getSmartDeviceData(entity)));
    }
    async querySmartDevicesByIds(ids) {
        const result = [];
        const exists = [];
        for (const entity of this.smartDevices) {
            if (!ids.includes(entity.context.id)) {
                continue;
            }
            exists.push(entity.context.id);
            result.push(await this._getSmartDeviceData(entity));
        }
        const final = [
            ...result,
        ];
        ids.forEach(id => {
            if (!exists.includes(id)) {
                final.push({
                    id,
                    error_code: 'DEVICE_NOT_FOUND',
                    error_message: 'Device not found',
                });
            }
        });
        return final;
    }
    async _updateDevices() {
        const { objects, enums } = await this._readObjects();
        const ids = Object.keys(objects);
        this.enums = [];
        this.smartDevices = [];
        this.usedIds = [];
        this.keys = [];
        ids.sort();
        const rooms = [];
        const funcs = [];
        Object.keys(enums).forEach(id => {
            const smartName = this.getSmartName(enums[id]);
            if (id.match(/^enum\.rooms\./) && smartName !== 'ignore' && smartName !== false) {
                rooms.push(id);
            }
            else if (id.match(/^enum\.functions\./) && smartName !== 'ignore' && smartName !== false) {
                funcs.push(id);
            }
        });
        const result = [];
        const roomNames = {};
        funcs.forEach(funcId => {
            const func = enums[funcId];
            const members = func.common?.members;
            if (!members || typeof members !== 'object' || !members.length) {
                return;
            }
            let funcName = this.getSmartName(func);
            funcName ||= func.common.name;
            if (funcName && typeof funcName === 'object') {
                funcName = funcName[this.lang] || funcName.en;
            }
            if (!funcName) {
                funcName = funcId.substring('enum.functions.'.length);
                funcName = funcName[0].toUpperCase() + funcName.substring(1);
            }
            members.forEach(id => {
                rooms.forEach(roomId => {
                    const room = enums[roomId];
                    const roomMembers = room.common?.members;
                    if (!roomMembers || typeof roomMembers !== 'object' || !roomMembers.length) {
                        return;
                    }
                    if (roomMembers.includes(id)) {
                        if (!roomNames[roomId]) {
                            let roomName = this.getSmartName(room);
                            roomName ||= room.common.name;
                            if (roomName && typeof roomName === 'object') {
                                roomName = roomName[this.lang] || roomName.en;
                            }
                            if (!roomName) {
                                roomName = roomId.substring('enum.rooms.'.length);
                                roomName = roomName[0].toUpperCase() + roomName.substring(1);
                            }
                            roomNames[roomId] = roomName;
                        }
                        this.processState(ids, objects, id, roomNames[roomId], funcName, result);
                    }
                });
            });
        });
        // scan alias.* and linkeddevices.*
        for (let i = 0; i < ids.length; i++) {
            if (ids[i] < 'alias.') {
                continue;
            }
            if (ids[i] > 'linkeddevices.香') {
                break;
            }
            if ((ids[i].startsWith('alias.') || ids[i].startsWith('linkeddevices.')) &&
                objects[ids[i]] &&
                (objects[ids[i]].type === 'device' || objects[ids[i]].type === 'channel')) {
                this.processState(ids, objects, ids[i], (0, rooms_1.default)(this.lang, 'undefined'), (0, functions_1.default)(this.lang, 'undefined'), result);
            }
        }
        this.usedIds = null;
        this.keys = null;
        result.forEach(entity => this.adapter.log.debug(`[ALISA] ${entity.context.id} => ${entity.context.type} ${entity.context.name}`));
        return result;
    }
    async _doSmartDeviceAction(entity, data) {
        if (entity.COMMANDS?.set_state) {
            return entity.COMMANDS.set_state(entity, data);
        }
        return {
            id: data.id,
            error_code: 'INVALID_ACTION',
            error_message: 'Device has not this action',
        };
    }
    checkUrlKey(_forceCheck) {
        const now = Date.now();
        if (this.urlKey && (!this.keyPromise || now - this.keyPromiseTime > 900000)) {
            this.keyPromiseTime = now;
            this.keyPromise = this._performUrlKeyCheck();
        }
        else {
            this.keyPromise ||= Promise.resolve();
        }
        return this.keyPromise;
    }
    async _performUrlKeyCheck() {
        const url = `${URL_STATUS}?user=${encodeURIComponent(this.adapter.config.login)}&urlKey=${encodeURIComponent(this.urlKey.key)}&p=${PROTOCOL_VERSION}&v=${this.adapter.version || ''}`;
        try {
            const response = await axios_1.default.get(url, { validateStatus: status => status === 200 });
            this.adapter.log.debug(`[ALISA] CHECK URL reported: ${JSON.stringify(response.data)}`);
            this.urlKeyOk = true;
        }
        catch (error) {
            const err = error;
            let errorMessage;
            if (err.response) {
                errorMessage = err.response.data || err.response.status;
            }
            else if (err.request) {
                errorMessage = 'No answer';
            }
            else {
                errorMessage = err.message;
            }
            if (this.adapter.config.yandexAlisa) {
                this.adapter.log.error(`[ALISA] Url Key error. Alisa Request and Response are working. But device states are not reported automatically. If you have pro license please try to delete iot.0.certs: ${errorMessage}`);
            }
        }
    }
    async updateState(id, _state) {
        const now = Date.now();
        if (!this.urlKeyOk ||
            (this.unknownDevices[id] && now - this.unknownDevices[id] < RETRY_UNKNOWN_DEVICES_INTERVAL)) {
            return;
        }
        if (!this.urlKey) {
            return;
        }
        let i = 0;
        while (i < this.rateCalculation.length) {
            if (now - this.rateCalculation[i] < 60000) {
                break;
            }
            i++;
        }
        if (i) {
            if (i < this.rateCalculation.length) {
                this.rateCalculation.splice(0, i);
            }
            else {
                this.rateCalculation = [];
            }
        }
        if (this.rateCalculation.length > 60) {
            this.adapter.log.warn(`[ALISA] Sending too fast: ${this.rateCalculation.length} in last minute!`);
            return;
        }
        this.rateCalculation.push(now);
        try {
            const devices = await this.querySmartDevicesByIds([id]);
            const json = {
                ts: Date.now() / 100,
                payload: {
                    user_id: this.user_id,
                    devices: devices.map(d => this._getSmartDeviceState(d)),
                },
            };
            this.adapter.log.debug(`[ALISA] Response: ${JSON.stringify(json)}`);
            const url = `${URL_STATUS}?user=${encodeURIComponent(this.adapter.config.login)}&urlKey=${encodeURIComponent(this.urlKey.key)}&p=${PROTOCOL_VERSION}&v=${this.adapter.version || ''}`;
            const response = await axios_1.default.post(url, json, { validateStatus: status => status === 200 });
            if (this.unknownDevices[id]) {
                delete this.unknownDevices[id];
            }
            this.adapter.log.debug(`[ALISA] Status reported:  ${JSON.stringify(json)}  ${JSON.stringify(response.data)}`);
        }
        catch (error) {
            const err = error;
            if (err.response?.status === 404) {
                this.adapter.log.error(`[ALISA] device ${id} is unknown to alisa`);
                this.unknownDevices[id] = Date.now();
            }
            else if (err.response?.status === 401) {
                this.adapter.log.error(`[ALISA] auth error: ${JSON.stringify(err.response.body)}`);
                this.urlKeyOk = false;
            }
            else if (err.response?.status === 410) {
                this.adapter.log.error(`[ALISA] invalid protocol version: ${JSON.stringify(err.response.body)}`);
                this.urlKeyOk = false;
            }
            else {
                let errorMessage;
                if (err.response) {
                    errorMessage = err.response.data || err.response.status;
                }
                else if (err.request) {
                    errorMessage = 'No answer';
                }
                else {
                    errorMessage = err.message;
                }
                this.adapter.log.error(`[ALISA] Cannot updateState: ${errorMessage}`);
                this.adapter.log.debug(`[ALISA] ${JSON.stringify(err.response?.body)}`);
            }
        }
    }
    async doAction(deviceData) {
        const entity = this.smartDevices.find(e => deviceData.id === e.context.id);
        if (entity) {
            return this._doSmartDeviceAction(entity, deviceData);
        }
        return {
            id: deviceData.id,
            error_code: 'DEVICE_NOT_FOUND',
            error_message: 'Device not found',
        };
    }
    async process(request, isEnabled) {
        if (!request) {
            this.adapter.log.error('[ALISA] Invalid request: no request!');
            return { error: 'Invalid request: no request!' };
        }
        if (!isEnabled) {
            return { error: (0, texts_1.default)(this.lang, 'The service deactivated'), errorCode: 500 };
        }
        if (!request.alisa) {
            return { error: (0, texts_1.default)(this.lang, 'missing inputs'), errorCode: 400 };
        }
        this.adapter.log.debug(`[ALISA] Received ${JSON.stringify(request.alisa)}`);
        const url = request.alisa.replace(/^\/[-_\w\d]+\//, '/');
        switch (url) {
            // https://yandex.ru/dev/dialogs/alice/doc/smart-home/reference/check-docpage/
            case '/v1.0':
                return {};
            // https://yandex.ru/dev/dialogs/alice/doc/smart-home/reference/get-devices-docpage/
            case '/v1.0/user/devices': {
                const result = {
                    request_id: (0, node_crypto_1.randomUUID)(),
                    payload: {
                        user_id: this.user_id,
                        devices: await this.getSmartDevices(),
                    },
                };
                this.adapter.log.debug(`[ALISA] Response: ${JSON.stringify(result)}`);
                return result;
            }
            // https://yandex.ru/dev/dialogs/alice/doc/smart-home/reference/post-devices-query-docpage/
            case '/v1.0/user/devices/query': {
                const queryDevices = request.devices || [];
                const ids = [];
                queryDevices.forEach(element => ids.push(element.id));
                if (ids.length) {
                    const devices = await this.querySmartDevicesByIds(ids);
                    const queryPayload = {
                        user_id: this.user_id,
                        devices: devices.map(d => this._getSmartDeviceState(d)),
                    };
                    if (!devices.length) {
                        queryPayload.devices = queryDevices;
                    }
                    const queryResult = {
                        request_id: (0, node_crypto_1.randomUUID)(),
                        payload: queryPayload,
                    };
                    this.adapter.log.debug(`[ALISA] Response: ${JSON.stringify(queryResult)}`);
                    return queryResult;
                }
                break;
            }
            // https://yandex.ru/dev/dialogs/alice/doc/smart-home/reference/post-action-docpage/
            case '/v1.0/user/devices/action': {
                const actionDevices = request.payload ? request.payload.devices || [] : [];
                const devices = [];
                for (let i = 0; i < actionDevices.length; i++) {
                    devices.push(await this.doAction(actionDevices[i]));
                }
                const result = {
                    request_id: (0, node_crypto_1.randomUUID)(),
                    payload: { devices },
                };
                this.adapter.log.debug(`[ALISA] Response: ${JSON.stringify(result)}`);
                return result;
            }
            // https://yandex.ru/dev/dialogs/alice/doc/smart-home/reference/unlink-docpage/
            case '/alisaIot/v1.0/user/unlink':
                return {};
            default:
                return { error: (0, texts_1.default)(this.lang, 'missing data'), errorCode: 400 };
        }
        return { error: (0, texts_1.default)(this.lang, 'missing inputs'), errorCode: 400 };
    }
}
exports.default = YandexAlisa;
//# sourceMappingURL=alisa.js.map