// Resolve bundled model + tokenizer assets to on-device file paths.
//
// The files under assets/models/** are produced by tools/export_onnx.py and
// must exist before the app is bundled (Metro resolves these requires at build
// time). See assets/models/README.md.
import { Asset } from "expo-asset";

// Bundle precision. int8 = the quantized models (4x smaller, what a shipped app
// would carry); fp32 = full precision. export_onnx.py prints which precision
// passed parity — bundle that one. Metro needs literal require paths, so both
// precisions are require()'d and the flag just selects which path to return.
export const BUNDLE: "int8" | "fp32" = "int8";

// Static requires (Metro needs literal paths). assetExts in metro.config.js
// makes .onnx / .txt load as binary/text assets.
const REGISTRY = {
  embedModelFp32: require("../assets/models/bge-small-en-v1.5/model.onnx"),
  embedModelInt8: require("../assets/models/bge-small-en-v1.5/model.int8.onnx"),
  embedVocab: require("../assets/models/bge-small-en-v1.5/vocab.txt"),
  rerankModelFp32: require("../assets/models/bge-reranker-base/model.onnx"),
  rerankModelInt8: require("../assets/models/bge-reranker-base/model.int8.onnx"),
} as const;

const PRECISION = {
  embedModel: { int8: "embedModelInt8", fp32: "embedModelFp32" },
  rerankModel: { int8: "rerankModelInt8", fp32: "rerankModelFp32" },
} as const;

export type AssetName = keyof typeof REGISTRY;

/** Download (cache) a bundled asset and return a plain filesystem path. */
export async function assetPath(name: AssetName): Promise<string> {
  const asset = Asset.fromModule(REGISTRY[name]);
  if (!asset.downloaded) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  // ORT and FileSystem readers want a bare path, not a file:// URI.
  return uri.replace(/^file:\/\//, "");
}

/** Resolve a model to the file for the bundled precision (int8 | fp32). */
export function modelPath(logical: keyof typeof PRECISION): Promise<string> {
  return assetPath(PRECISION[logical][BUNDLE]);
}
