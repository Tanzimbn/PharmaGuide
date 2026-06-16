# M0 Spike — "Is the phone fast enough?"

**Track B, phase M0.** A throwaway test app whose only job is to answer one
question before any real mobile work starts:

> Can a React Native app run the embedding + reranker models **on-device, with
> hardware acceleration, fast enough** on a real iPhone and a real Android?

If yes → Track B is green, proceed to M1. If no → we learned it in ~1–2 days
instead of after building the whole app. **Do not build past M0 until M0
passes.**

---

## 1. What we are proving (and NOT proving)

**Proving:**
- The models load and run on-device through `onnxruntime-react-native`.
- Hardware acceleration actually engages (NNAPI/XNNPACK on Android, CoreML on
  iOS) and beats plain CPU.
- The three real workloads hit acceptable speed: **bulk embed** (ingest),
  **single embed** (query), **rerank** (per query).
- Tokenization works on-device (a known gotcha — see §4).

**NOT proving (leave for M1+):** PDF reading, SQLite/sqlite-vec storage, the LLM
call, any UI. Keep the spike to one screen with buttons and a results label.

---

## 2. Test devices (use real hardware, not just simulators)

| Slot | Suggested | Why |
| --- | --- | --- |
| Android — mid | A ~$250–400 phone, 3–4 yr old chip | The realistic floor; if this passes, most users are fine |
| iPhone — mid | iPhone 11/12-class or newer | CoreML path |
| (optional) low-end Android | budget device | Confirms the "drop reranker" fallback threshold |

Simulators lie about ML speed (no NNAPI/CoreML). **Measure on physical devices.**

---

## 3. Models to prepare (one-time, on your laptop)

1. **Embedding:** `BAAI/bge-small-en-v1.5` → export to **ONNX** (e.g. via
   HuggingFace Optimum). Output: 384-dim. Remember the post-steps the model
   needs — **mean-pool token outputs + L2-normalize** — so the on-device vectors
   match the web app's pgvector vectors.
2. **Reranker:** `BAAI/bge-reranker-base` → export to **ONNX**. Cross-encoder:
   takes (query, passage) pairs, outputs a logit → apply **sigmoid** for the
   0–1 score the threshold compares against.
3. Note each file's size (embed ~30–130 MB, reranker ~100 MB) — feeds the
   "bundle vs download" decision later.

**Sanity check before the phone:** run both ONNX files on your laptop and
confirm one or two embeddings/scores match the Python (web) outputs within
rounding. If they don't match here, they won't on the phone.

---

## 4. The tokenizer sub-risk (check early)

bge models need **BERT WordPiece tokenization** before inference. The phone must
do this too. Options:
- a JS tokenizer (e.g. the tokenizer from `@xenova/transformers`), or
- a native/WASM tokenizer.

Confirm in the spike that on-device tokenization produces the **same token ids**
as the Python tokenizer for a sample sentence. A mismatch here silently wrecks
retrieval quality. Treat this as a pass/fail item, not an afterthought.

---

## 5. Build steps

1. `npx react-native init` (or Expo with a dev build — must support native
   modules) — bare minimum app, one screen.
2. Add `onnxruntime-react-native`. Bundle the two ONNX files as assets.
3. Wire three buttons:
   - **Embed ×1** — embed a single sentence.
   - **Embed ×200** — embed 200 short passages (stands in for a ~50-page PDF),
     batched.
   - **Rerank ×20** — score 20 (query, passage) pairs.
4. For each run, record: wall-clock time, and whether the accelerated execution
   provider was actually used.
5. Run the same build **twice per device**: once with the hardware EP
   (NNAPI/CoreML/XNNPACK) and once forced to CPU — to confirm acceleration is
   real, not assumed.

---

## 6. What to measure + pass/fail thresholds

Per device, accelerated:

| Metric | What it stands for | ✅ Pass | ⚠️ Borderline | ❌ Fail |
| --- | --- | --- | --- | --- |
| **Embed ×200** (batched) | ingest a ~50-page PDF | ≤ ~20 s (≥10/s) | 20–60 s | > 60 s |
| **Embed ×1** | query latency | < 150 ms | 150–500 ms | > 500 ms |
| **Rerank ×20** | per-query rerank | < 1 s | 1–3 s | > 3 s |
| **Cold model load** | first use after launch | < 3 s | 3–10 s | > 10 s |
| **Peak memory** | OOM risk | no crash, comfortable | near limit | OOM / crash |
| **Tokenizer match** | retrieval correctness | ids match Python | — | mismatch |
| **Accel vs CPU** | acceleration is real | accel clearly faster | ~equal | accel unavailable |

(Thresholds tie back to the §10 latency budget in `mobile.md`. Ingest is a
one-time cost the user waits through once per document, so it's the most
forgiving; query + rerank are per-interaction, so they're stricter.)

---

## 7. Decision gate

- **🟢 Green — all ✅:** Track B is viable as designed. Proceed to M1. Lock the
  reranker as on-device.
- **🟡 Yellow — query/rerank ✅ but ingest borderline, OR reranker too slow:**
  Still viable with tweaks:
  - Background/chunked ingest with a progress bar (hide the ingest cost).
  - **Drop the on-device reranker** (the doc already allows this) — rely on
    bge-small + a slightly larger top-k. Re-test query path only.
- **🔴 Red — single embed > 500 ms, or no acceleration, or OOM, or tokenizer
  mismatch:** On-device on the phone isn't practical. Fall back options, in
  order:
  1. Keep **embeddings server-side** (thin client) and only store/query on
     device — gives up "models on device" but keeps the app.
  2. Revisit the whole Track B premise.

---

## 8. Deliverable

A one-page results table: the §6 metrics filled in for each device, the
accel-vs-CPU comparison, the tokenizer-match result, and a one-line verdict
(🟢/🟡/🔴) with the chosen next step. That page is the input to deciding whether
M1 starts.

**Time box:** ~1–2 days. If model export or the tokenizer eats more than that,
that *is* a signal — note it and report, don't grind.
