"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class IotProxy {
    static device;
    static stateChangedTopic;
    static login;
    static init(device, clientId, login) {
        IotProxy.device = device;
        IotProxy.stateChangedTopic = `response/${clientId}/changeReport`;
        this.login = login;
    }
    static publishStateChange(stateChange) {
        // replace INVALID token with the client id
        if (stateChange.event?.endpoint) {
            stateChange.event.endpoint.scope.token = this.login;
        }
        return IotProxy.publish(IotProxy.stateChangedTopic, stateChange);
    }
    /** AddOrUpdateReport and DeleteReport take the same way as ChangeReport, but carry the token in the payload */
    static publishDiscoveryReport(report) {
        report.event.payload.scope.token = this.login;
        return IotProxy.publish(IotProxy.stateChangedTopic, report);
    }
    static publish(topic, message) {
        if (typeof message !== 'string') {
            message = JSON.stringify(message);
        }
        setTimeout(strMessage => {
            IotProxy.device?.publish(topic, strMessage, { qos: 0 }, (_error) => { });
        }, 100, message);
    }
}
exports.default = IotProxy;
//# sourceMappingURL=IotProxy.js.map