// Bundle the ONNX models and the BERT vocab as binary/text assets so
// expo-asset can resolve them to on-device file paths at runtime.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("onnx", "ort", "bin", "txt");

module.exports = config;
