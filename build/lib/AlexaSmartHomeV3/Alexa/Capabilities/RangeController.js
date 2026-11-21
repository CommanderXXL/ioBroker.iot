"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Properties_1 = __importDefault(require("../Properties"));
const Base_1 = __importDefault(require("./Base"));
class RangeController extends Base_1.default {
    min;
    max;
    unit;
    constructor(opts) {
        super();
        this._properties = [new Properties_1.default.RangeValue(opts)];
        this.min = opts.setState?.common.min || 0;
        this.max = opts.setState?.common.max || 100;
        this.unit = opts.setState?.common.unit || '';
    }
    get instance() {
        return this._properties[0].instance;
    }
    matches(event) {
        // A device can have several RangeControllers (e.g. a blind and a slider): Alexa names the addressed one
        const instance = event?.directive?.header?.instance;
        return super.matches(event) && (!instance || instance === this.instance);
    }
    get alexaResponse() {
        return {
            interface: this.namespace,
            instance: this.instance,
            version: this.version,
            properties: this.discoverableProperties,
            configuration: this.configuration,
            capabilityResources: this.capabilityResources,
        };
    }
    get capabilityResources() {
        if (this.unit === '°C' || this.unit === '°F') {
            return {
                friendlyNames: [
                    {
                        '@type': 'asset',
                        value: {
                            assetId: 'Alexa.Setting.Temperature',
                        },
                    },
                    {
                        '@type': 'text',
                        value: {
                            text: 'Temperatur',
                            locale: 'de-DE',
                        },
                    },
                    {
                        '@type': 'text',
                        value: {
                            text: 'Temperature',
                            locale: 'en-US',
                        },
                    },
                    {
                        '@type': 'text',
                        value: {
                            text: 'Temperatura',
                            locale: 'es-MX',
                        },
                    },
                    {
                        '@type': 'text',
                        value: {
                            text: 'Température',
                            locale: 'fr-CA',
                        },
                    },
                ],
            };
        }
        return {
            friendlyNames: [
                {
                    '@type': 'asset',
                    value: {
                        assetId: 'Alexa.Setting.Preset',
                    },
                },
                {
                    '@type': 'text',
                    value: {
                        text: 'Niveau',
                        locale: 'de-DE',
                    },
                },
                {
                    '@type': 'text',
                    value: {
                        text: 'Level',
                        locale: 'en-US',
                    },
                },
                {
                    '@type': 'text',
                    value: {
                        text: 'Nivel',
                        locale: 'es-MX',
                    },
                },
                {
                    '@type': 'text',
                    value: {
                        text: 'Niveau',
                        locale: 'fr-CA',
                    },
                },
            ],
        };
    }
    get presets() {
        return [
            {
                rangeValue: this.max,
                presetResources: {
                    friendlyNames: [
                        {
                            '@type': 'asset',
                            value: {
                                assetId: 'Alexa.Value.Maximum',
                            },
                        },
                        {
                            '@type': 'asset',
                            value: {
                                assetId: 'Alexa.Value.High',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Maximum',
                                locale: 'de-DE',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Highest',
                                locale: 'en-US',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Fast',
                                locale: 'en-US',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Alta',
                                locale: 'es-MX',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Élevée',
                                locale: 'fr-CA',
                            },
                        },
                    ],
                },
            },
            {
                rangeValue: (this.max + this.min) / 2,
                presetResources: {
                    friendlyNames: [
                        {
                            '@type': 'asset',
                            value: {
                                assetId: 'Alexa.Value.Medium',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Mitte',
                                locale: 'de-DE',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Medium',
                                locale: 'en-US',
                            },
                        },
                    ],
                },
            },
            {
                rangeValue: this.min,
                presetResources: {
                    friendlyNames: [
                        {
                            '@type': 'asset',
                            value: {
                                assetId: 'Alexa.Value.Minimum',
                            },
                        },
                        {
                            '@type': 'asset',
                            value: {
                                assetId: 'Alexa.Value.Low',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Minimum',
                                locale: 'de-DE',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Lowest',
                                locale: 'en-US',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Slow',
                                locale: 'en-US',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Baja',
                                locale: 'es-MX',
                            },
                        },
                        {
                            '@type': 'text',
                            value: {
                                text: 'Faible',
                                locale: 'fr-CA',
                            },
                        },
                    ],
                },
            },
        ];
    }
    get configuration() {
        // Map known units to Alexa units
        let unitOfMeasure;
        switch (this.unit) {
            case '°C':
                unitOfMeasure = 'Alexa.Unit.Temperature.Celsius';
                break;
            case '°F':
                unitOfMeasure = 'Alexa.Unit.Temperature.Fahrenheit';
                break;
            case '%':
                unitOfMeasure = 'Alexa.Unit.Percent';
                break;
        }
        return {
            supportedRange: {
                minimumValue: this.min,
                maximumValue: this.max,
                precision: 1,
            },
            unitOfMeasure,
            presets: this.presets,
        };
    }
}
exports.default = RangeController;
//# sourceMappingURL=RangeController.js.map