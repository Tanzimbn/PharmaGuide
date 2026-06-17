// On-device cross-encoder rerank: tokenize (q,passage) -> ONNX -> logit -> sigmoid.
//
// Mirrors backend/app/query/rerank.py (sigmoid on the raw logit). For M0 this is
// a LATENCY probe (Rerank x20). Tokenization uses the WordPiece tokenizer as a
// length proxy only — the real reranker tokenizer is XLM-R SentencePiece, so the
// SCORES here are not parity-valid on device (validated on laptop instead). See
// tokenizer.ts scope note. The reranker is droppable on weak devices (mobile.md §12).
import { InferenceSession } from "onnxruntime-react-native";

import { modelPath } from "./assets";
import { buildFeeds, createSession, EpMode, int64Tensor } from "./onnx";
import { WordPieceTokenizer } from "./tokenizer";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export class Reranker {
  private constructor(
    private session: InferenceSession,
    private tok: WordPieceTokenizer,
  ) {}

  /** Reuses the embedder's vocab path for the length-proxy tokenizer. */
  static async load(mode: EpMode, vocabPath: string): Promise<Reranker> {
    const rerankPath = await modelPath("rerankModel");
    const [session, tok] = await Promise.all([
      createSession(rerankPath, mode),
      WordPieceTokenizer.fromVocab(vocabPath),
    ]);
    return new Reranker(session, tok);
  }

  /** Score (query, passage) pairs -> 0..1 relevance (one run, batched). */
  async score(pairs: [string, string][]): Promise<number[]> {
    const enc = this.tok.encodePairs(pairs);
    const feeds = buildFeeds(this.session, {
      input_ids: int64Tensor(enc.inputIds),
      attention_mask: int64Tensor(enc.attentionMask),
      token_type_ids: int64Tensor(enc.tokenTypeIds),
    });
    const out = await this.session.run(feeds);
    const logits = out[this.session.outputNames[0]].data as Float32Array;
    return Array.from(logits, sigmoid);
  }
}
