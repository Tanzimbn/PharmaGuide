// BERT WordPiece tokenizer (uncased) for bge-small-en-v1.5.
//
// Hand-rolled and RN-clean (no native deps), so on-device token ids can be
// parity-checked against the Python tokenizer — the spike's pass/fail gate for
// retrieval correctness (mobile-m0-spike.md §4).
//
// SCOPE NOTE: bge-small uses WordPiece (this file). bge-reranker-base is
// XLM-RoBERTa (SentencePiece) — a DIFFERENT tokenizer. For the M0 perf spike we
// reuse this tokenizer on the reranker purely as a sequence-length proxy so the
// Rerank-x20 *timing* is representative; reranker SCORE parity is validated on
// the laptop with the real HF tokenizer (tools/export_onnx.py), not on device.
// If M0 is green and the reranker is kept, M1 must add a SentencePiece tokenizer.
import * as FileSystem from "expo-file-system";

const MAX_LEN = 512;
const MAX_WORD_CHARS = 100;

export interface Encoding {
  inputIds: number[][];
  attentionMask: number[][];
  tokenTypeIds: number[][];
}

export class WordPieceTokenizer {
  private vocab = new Map<string, number>();
  private unk = 100;
  private cls = 101;
  private sep = 102;
  private pad = 0;

  static async fromVocab(vocabPath: string): Promise<WordPieceTokenizer> {
    const text = await FileSystem.readAsStringAsync(vocabPath);
    const t = new WordPieceTokenizer();
    text.split("\n").forEach((line, i) => {
      const tok = line.replace(/\r$/, "");
      if (tok.length) t.vocab.set(tok, i);
    });
    t.unk = t.vocab.get("[UNK]") ?? t.unk;
    t.cls = t.vocab.get("[CLS]") ?? t.cls;
    t.sep = t.vocab.get("[SEP]") ?? t.sep;
    t.pad = t.vocab.get("[PAD]") ?? t.pad;
    return t;
  }

  /** Basic tokenizer: lowercase, strip accents, split on whitespace + punctuation. */
  private basic(text: string): string[] {
    const cleaned = text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining accents (uncased)
      .toLowerCase();
    const out: string[] = [];
    let cur = "";
    for (const ch of cleaned) {
      if (/\s/.test(ch)) {
        if (cur) out.push(cur), (cur = "");
      } else if (/[^\p{L}\p{N}]/u.test(ch)) {
        if (cur) out.push(cur), (cur = "");
        out.push(ch); // punctuation is its own token
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  /** Greedy longest-match WordPiece with ## continuation. */
  private wordpiece(token: string): number[] {
    if (token.length > MAX_WORD_CHARS) return [this.unk];
    const ids: number[] = [];
    let start = 0;
    while (start < token.length) {
      let end = token.length;
      let curId = -1;
      while (start < end) {
        const sub = (start > 0 ? "##" : "") + token.slice(start, end);
        const id = this.vocab.get(sub);
        if (id !== undefined) {
          curId = id;
          break;
        }
        end--;
      }
      if (curId === -1) return [this.unk]; // any unmatched piece -> whole word UNK
      ids.push(curId);
      start = end;
    }
    return ids;
  }

  private toIds(text: string): number[] {
    const ids: number[] = [];
    for (const w of this.basic(text)) ids.push(...this.wordpiece(w));
    return ids;
  }

  /** Encode single texts -> padded batch ([CLS] a [SEP]). */
  encode(texts: string[]): Encoding {
    const seqs = texts.map((t) => {
      const body = this.toIds(t).slice(0, MAX_LEN - 2);
      return [this.cls, ...body, this.sep];
    });
    return this.pad2d(seqs, seqs.map((s) => s.map(() => 0)));
  }

  /** Encode (query, passage) pairs -> [CLS] q [SEP] p [SEP] with segment ids. */
  encodePairs(pairs: [string, string][]): Encoding {
    const seqs: number[][] = [];
    const segs: number[][] = [];
    for (const [q, p] of pairs) {
      const a = this.toIds(q);
      const b = this.toIds(p);
      let ids = [this.cls, ...a, this.sep, ...b, this.sep].slice(0, MAX_LEN);
      const segA = 1 + a.length + 1; // [CLS] q [SEP]
      const seg = ids.map((_, i) => (i < segA ? 0 : 1));
      seqs.push(ids);
      segs.push(seg);
    }
    return this.pad2d(seqs, segs);
  }

  private pad2d(seqs: number[][], segs: number[][]): Encoding {
    const max = Math.max(1, ...seqs.map((s) => s.length));
    const inputIds: number[][] = [];
    const attentionMask: number[][] = [];
    const tokenTypeIds: number[][] = [];
    seqs.forEach((s, i) => {
      const padN = max - s.length;
      inputIds.push([...s, ...Array(padN).fill(this.pad)]);
      attentionMask.push([...s.map(() => 1), ...Array(padN).fill(0)]);
      tokenTypeIds.push([...segs[i], ...Array(padN).fill(0)]);
    });
    return { inputIds, attentionMask, tokenTypeIds };
  }
}
