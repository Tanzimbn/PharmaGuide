// Resolve bundled model + tokenizer assets to on-device file paths.
//
// The files under assets/models/** are produced by tools/export_onnx.py and
// must exist before the app is bundled (Metro resolves these requires at build
// time). See assets/models/README.md.
import { Asset } from "expo-asset";

// We bundle the int8 (quantized) models only. `require` is static — Metro
// bundles every required file regardless of any runtime flag — and the fp32
// reranker is ~1 GB, which (a) blows Node's max string length when Metro reads
// it (`Cannot create a string longer than 0x1fffffe8`) and (b) can't ship on
// mobile anyway. int8 is what a real app would carry; export_onnx.py confirms
// int8 passes parity. To test fp32 instead, swap the require paths below (only
// embed fp32 at ~127 MB is small enough for Metro; the fp32 reranker is not).
const REGISTRY = {
  embedModel: require("../assets/models/bge-small-en-v1.5/model.int8.onnx"),
  embedVocab: require("../assets/models/bge-small-en-v1.5/vocab.txt"),
  rerankModel: require("../assets/models/bge-reranker-base/model.int8.onnx"),
} as const;

export type AssetName = keyof typeof REGISTRY;

/** Download (cache) a bundled asset and return its file:// URI.
 *  Use for expo-file-system readers (readAsStringAsync), which need the scheme. */
export async function assetPath(name: AssetName): Promise<string> {
  const asset = Asset.fromModule(REGISTRY[name]);
  if (!asset.downloaded) await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

/** Resolve a model to a bare filesystem path (no file:// scheme) for ORT. */
export async function modelPath(logical: "embedModel" | "rerankModel"): Promise<string> {
  return (await assetPath(logical)).replace(/^file:\/\//, "");
}
