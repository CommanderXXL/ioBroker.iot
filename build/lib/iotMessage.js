"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_IOT_MESSAGE_LENGTH = void 0;
exports.packMessage = packMessage;
exports.getPackedSize = getPackedSize;
exports.getSentSize = getSentSize;
const node_zlib_1 = require("node:zlib");
// AWS IoT MQTT message size limit (128 KB minus overhead)
exports.MAX_IOT_MESSAGE_LENGTH = 127 * 1024;
/**
 * Packs a message the same way as it is sent to the cloud if it is bigger than MAX_IOT_MESSAGE_LENGTH.
 */
function packMessage(payload) {
    return (0, node_zlib_1.deflateSync)(payload).toString('base64');
}
/**
 * Size in bytes of the packed message as it is sent to the cloud.
 */
function getPackedSize(payload) {
    return packMessage(payload).length;
}
/**
 * Size in bytes of the message as it is sent to the cloud: unpacked if it fits, otherwise packed.
 */
function getSentSize(payload) {
    const bytes = Buffer.byteLength(payload);
    return bytes > exports.MAX_IOT_MESSAGE_LENGTH ? getPackedSize(payload) : bytes;
}
//# sourceMappingURL=iotMessage.js.map