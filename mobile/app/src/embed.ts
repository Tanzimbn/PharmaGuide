// On-device embedding: tokenize -> ONNX -> CLS pool -> L2-normalize.
//
// Matches the web app's encode path (backend/app/ingestion/embed.py): bge-small,
// 384-dim, normalized. POOLING IS CLS (last_hidden_state[:, 0, :]), NOT mean —
// see export_onnx.py for why.
import { InferenceSession } from "onnxruntime-react-native";

import { assetPath, modelPath } from "./assets";
import { buildFeeds, createSession, EpMode, int64Tensor } from "./onnx";
import { WordPieceTokenizer } from "./tokenizer";

export const EMBED_DIM = 384;

export class Embedder {
  private constructor(
    private session: InferenceSession,
    private tok: WordPieceTokenizer,
  ) {}

  static async load(mode: EpMode): Promise<Embedder> {
    const [embedPath, vocabPath] = await Promise.all([
      modelPath("embedModel"),
      assetPath("embedVocab"),
    ]);
    const [session, tok] = await Promise.all([
      createSession(embedPath, mode),
      WordPieceTokenizer.fromVocab(vocabPath),
    ]);
    return new Embedder(session, tok);
  }

  /** Embed a batch -> one L2-normalized 384-d vector per input text. */
  async embed(texts: string[]): Promise<Float32Array[]> {
    const enc = this.tok.encode(texts);
    const feeds = buildFeeds(this.session, {
      input_ids: int64Tensor(enc.inputIds),
      attention_mask: int64Tensor(enc.attentionMask),
      token_type_ids: int64Tensor(enc.tokenTypeIds),
    });
    const out = await this.session.run(feeds);
    const lhs = out[this.session.outputNames[0]];
    const data = lhs.data as Float32Array;
    const [b, t, h] = lhs.dims as number[];
    void t;

    const vecs: Float32Array[] = [];
    for (let i = 0; i < b; i++) {
      // CLS token = position 0 of each sequence.
      const base = i * (lhs.dims[1] as number) * h;
      const v = new Float32Array(h);
      let norm = 0;
      for (let k = 0; k < h; k++) {
        const x = data[base + k];
        v[k] = x;
        norm += x * x;
      }
      norm = Math.sqrt(norm) || 1;
      for (let k = 0; k < h; k++) v[k] /= norm;
      vecs.push(v);
    }
    return vecs;
  }
}
