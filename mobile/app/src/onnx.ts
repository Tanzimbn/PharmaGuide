// ONNX Runtime session creation + execution-provider selection (spike §5).
//
// We REQUEST an execution provider per platform; the run-twice (accel vs cpu)
// timing comparison is what proves acceleration is real — onnxruntime-react-
// native has no public API to report which EP actually bound, so timing is the
// proxy (mobile-m0-spike.md §6 "Accel vs CPU").
import { InferenceSession, Tensor } from "onnxruntime-react-native";
import { Platform } from "react-native";

export type EpMode = "accel" | "cpu";

/** The accelerated EP we request for this platform. */
export function accelEp(): string {
  // XNNPACK often beats NNAPI for transformer ops on Android; both are worth a
  // manual try, but NNAPI is the headline accelerated path the spike reports.
  return Platform.OS === "ios" ? "coreml" : "nnapi";
}

export function epsFor(mode: EpMode): string[] {
  return mode === "cpu" ? ["cpu"] : [accelEp(), "cpu"];
}

export async function createSession(
  modelPath: string,
  mode: EpMode,
): Promise<InferenceSession> {
  return InferenceSession.create(modelPath, {
    executionProviders: epsFor(mode),
    graphOptimizationLevel: "all",
  });
}

/** int64 tensor from a 2-D batch of token ids/masks (ORT wants BigInt64Array). */
export function int64Tensor(rows: number[][]): Tensor {
  const b = rows.length;
  const t = rows[0]?.length ?? 0;
  const data = new BigInt64Array(b * t);
  for (let i = 0; i < b; i++)
    for (let j = 0; j < t; j++) data[i * t + j] = BigInt(rows[i][j]);
  return new Tensor("int64", data, [b, t]);
}

/** Feed only the inputs this model actually declares (embed has token_type_ids,
 *  the XLM-R reranker does not). */
export function buildFeeds(
  session: InferenceSession,
  all: Record<string, Tensor>,
): Record<string, Tensor> {
  const feeds: Record<string, Tensor> = {};
  for (const name of session.inputNames) if (all[name]) feeds[name] = all[name];
  return feeds;
}
