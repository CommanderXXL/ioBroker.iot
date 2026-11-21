"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const type_detector_1 = require("@iobroker/type-detector");
const SceneController_1 = __importDefault(require("../Alexa/Capabilities/SceneController"));
const Control_1 = __importDefault(require("./Control"));
const AlexaResponse_1 = __importDefault(require("../Alexa/AlexaResponse"));
const AdapterProvider_1 = __importDefault(require("../Helpers/AdapterProvider"));
const EndpointHealth_1 = __importDefault(require("../Alexa/Capabilities/EndpointHealth"));
class Button extends Control_1.default {
    constructor(detectedControl) {
        super(detectedControl);
        const sceneController = new SceneController_1.default();
        this._supported = [sceneController];
        const health = this.connectivityInitObject();
        if (health) {
            this._supported.push(new EndpointHealth_1.default(health));
        }
    }
    get categories() {
        return ['SCENE_TRIGGER'];
    }
    /**
     * Scenes use button type from type-detector
     */
    static get type() {
        return type_detector_1.Types.button;
    }
    /**
     * Override handle to support SceneController.Activate directive
     */
    async handle(event) {
        this.log.debug(`handling Alexa scene activation event`);
        this.log.silly(`${JSON.stringify(event)}`);
        // Check if this is an Activate directive for SceneController
        if (event?.directive?.header?.namespace === 'Alexa.SceneController' &&
            event?.directive?.header?.name === 'Activate') {
            try {
                // Get the SET state (button state)
                const setState = this.states[this.statesMap.set];
                if (!setState?.id) {
                    throw new Error('No SET state found for scene');
                }
                // Trigger the scene by setting the button state to true
                await AdapterProvider_1.default.setState(setState.id, true);
                // Return ActivationStarted response
                const response = new AlexaResponse_1.default({
                    namespace: 'Alexa.SceneController',
                    name: 'ActivationStarted',
                    messageId: event.directive.header.messageId,
                    correlationToken: event.directive.header.correlationToken,
                    payloadVersion: '3',
                    token: event.directive.endpoint?.scope?.token,
                    endpointId: event.directive.endpoint?.endpointId,
                });
                response.event.payload = {
                    cause: {
                        type: 'VOICE_INTERACTION',
                    },
                    timestamp: new Date().toISOString(),
                };
                this.log.debug('Scene activated successfully');
                this.log.silly(`${JSON.stringify(response.get())}`);
                return response.get();
            }
            catch (error) {
                this.log.debug(`${error}`);
                this.log.error('Failed to activate scene');
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                return Promise.reject(AlexaResponse_1.default.endpointUnreachable(event).get());
            }
        }
        // If not an Activate directive, fall back to parent handler
        return super.handle(event);
    }
}
exports.default = Button;
//# sourceMappingURL=Button.js.map