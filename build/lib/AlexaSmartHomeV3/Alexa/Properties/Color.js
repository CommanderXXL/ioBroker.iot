"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Base_1 = __importDefault(require("./Base"));
const Utils_1 = require("../../Helpers/Utils");
class Color extends Base_1.default {
    _hal = undefined;
    _rgbw = undefined;
    _rgb = undefined;
    constructor(opts) {
        super(opts, true);
        if (!opts?.hal && !opts?.rgbw && !opts?.rgb) {
            throw new Error('Hue control requires hal object with hue, saturation, and brightness properties');
        }
        if (opts?.hal) {
            this._hal = opts.hal;
            this._setId = opts.hal.hue.id;
            this._getId = opts.hal.hue.id;
        }
        else if (opts?.rgbw) {
            this._rgbw = opts.rgbw;
            const rgbObject = this._rgbw;
            if (!rgbObject.red) {
                this._setId = this._rgbw.id;
                this._getId = this._rgbw.id;
            }
        }
        else if (opts?.rgb) {
            this._rgb = opts.rgb;
            const rgbObject = this._rgb;
            if (!rgbObject.red) {
                this._setId = this._rgb.id;
                this._getId = this._rgb.id;
            }
        }
    }
    matches(event) {
        return Color.matches(event) && event?.directive?.header?.name === 'SetColor';
    }
    /** Return IDs for HAL */
    get hal() {
        if (!this._hal?.hue) {
            return undefined;
        }
        return {
            hue: this._hal.hue.id,
            saturation: this._hal.saturation?.id,
            brightness: this._hal.brightness?.id,
        };
    }
    alexaValue(value) {
        if (typeof value === 'string') {
            // It could be hex color #RRGGBB or #RRGGBBAA or rgb(r,g,b) or rgba(r,g,b,a)
            if (value.startsWith('#')) {
                // If #rrggbbaa
                // if (value.length === 9) {
                //     return rgbw2hal(value);
                // }
                return (0, Utils_1.rgb2hal)((0, Utils_1.rgbwToHex)(value).substring(0, 7));
            }
            if (value.startsWith('rgba')) {
                return (0, Utils_1.rgbw2hal)((0, Utils_1.rgbwToHex)(value));
            }
            if (value.startsWith('rgb')) {
                return (0, Utils_1.rgb2hal)((0, Utils_1.rgbwToHex)(value));
            }
        }
        else if (value && typeof value === 'object' && value.hue !== undefined) {
            return value;
        }
        return undefined;
    }
    value(alexaValue) {
        if (typeof alexaValue === 'object' && alexaValue !== null) {
            const hslValue = alexaValue;
            if ('hue' in hslValue && 'saturation' in hslValue) {
                if (this._rgbw) {
                    return `${(0, Utils_1.hal2rgb)(hslValue)}ff`;
                }
                return (0, Utils_1.hal2rgb)(hslValue);
            }
        }
        return undefined;
    }
}
exports.default = Color;
//# sourceMappingURL=Color.js.map