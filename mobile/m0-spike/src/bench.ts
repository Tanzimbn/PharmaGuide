// Benchmark harness (mobile-m0-spike.md §5-§6). Times the three real workloads,
// runs the whole suite twice (accelerated EP vs forced CPU) to prove acceleration
// is real, plus a one-time on-device tokenizer-parity check.
import { assetPath } from "./assets";
import { Embedder } from "./embed";
import { EXPECTED_IDS, pairs, PARITY_SENTENCES, passages } from "./fixtures";
import { accelEp, EpMode } from "./onnx";
import { Reranker } from "./rerank";
import { WordPieceTokenizer } from "./tokenizer";

export interface SuiteResult {
  mode: EpMode;
  ep: string;
  coldLoadMs: number;
  embed1Ms: number;
  embed200Ms: number;
  rerank20Ms: number;
}

const ms = () => Date.now();

/** One full pass at a given EP mode. */
export async function runSuite(mode: EpMode): Promise<SuiteResult> {
  const ep = mode === "cpu" ? "cpu" : accelEp();

  const t0 = ms();
  const embedder = await Embedder.load(mode);
  const coldLoadMs = ms() - t0;

  await embedder.embed(["warmup"]); // absorb first-run graph init

  const t1 = ms();
  await embedder.embed(["What is the maximum holding time for bulk solution?"]);
  const embed1Ms = ms() - t1;

  const t2 = ms();
  await embedder.embed(passages(200));
  const embed200Ms = ms() - t2;

  const vocabPath = await assetPath("embedVocab");
  const reranker = await Reranker.load(mode, vocabPath);
  await reranker.score([["warmup", "warmup passage"]]);

  const t3 = ms();
  await reranker.score(pairs(20));
  const rerank20Ms = ms() - t3;

  return { mode, ep, coldLoadMs, embed1Ms, embed200Ms, rerank20Ms };
}

/** On-device WordPiece ids must equal the Python ids (retrieval correctness). */
export async function runTokenizerParity(): Promise<boolean> {
  const vocabPath = await assetPath("embedVocab");
  const tok = await WordPieceTokenizer.fromVocab(vocabPath);
  return PARITY_SENTENCES.every((s) => {
    const got = tok.encode([s]).inputIds[0]; // single -> no padding
    const want = EXPECTED_IDS[s];
    return (
      Array.isArray(want) &&
      got.length === want.length &&
      got.every((v, i) => v === want[i])
    );
  });
}
