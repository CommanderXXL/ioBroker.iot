"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIotDevice = createIotDevice;
exports.detachIotDevice = detachIotDevice;
const node_fs_1 = __importDefault(require("node:fs"));
const aws_iot_device_sdk_1 = require("aws-iot-device-sdk");
/**
 * Creates the AWS IoT device.
 *
 * aws-iot-device-sdk (common/lib/tls-reader.js) always calls `fs.existsSync(options.keyPath)`, `certPath` and
 * `caPath`, even if the certificates are given as Buffers. Node.js 24 warns about `fs.existsSync(undefined)`
 * (DEP0187). The certificates of this adapter are stored in states, not in files, so during the synchronous
 * constructor `existsSync` answers `undefined`/`null` itself with `false` - exactly what Node.js returns today.
 *
 * @param options options of the device
 */
function createIotDevice(options) {
    const writableFs = node_fs_1.default;
    const originalExistsSync = writableFs.existsSync;
    writableFs.existsSync = path => (path === undefined || path === null ? false : originalExistsSync(path));
    try {
        return new aws_iot_device_sdk_1.device(options);
    }
    finally {
        writableFs.existsSync = originalExistsSync;
    }
}
/**
 * Remove the adapter's listeners after closing the cloud connection.
 *
 * @param device the discarded SDK client
 */
function detachIotDevice(device) {
    device.removeAllListeners();
    // The SDK can still forward transport errors after end() has completed.
    device.on('error', () => undefined);
}
//# sourceMappingURL=createIotDevice.js.map