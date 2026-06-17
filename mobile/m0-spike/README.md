# M0 Spike — on-device inference feasibility

Throwaway app that answers the Track B gate question: **can a phone run the
embed + rerank models on-device, accelerated, fast enough?** Spec + pass/fail
thresholds: [`docs/mobile-m0-spike.md`](../../docs/mobile-m0-spike.md). Delete
this directory once the gate is decided.

## 1. Export the models (laptop, one-time)

```bash
cd ../tools
source ../../backend/.venv/bin/activate     # has torch + sentence-transformers
pip install -r requirements.txt
python export_onnx.py
```

Must print **`PARITY PASSED`** (ONNX outputs match the web app) and the model
sizes. Exports each model at **fp32 and int8** (dynamic quant, ~4x smaller) and
parity-checks both. Writes `assets/models/**` + `assets/tokenizer_parity.json`
(gitignored — large/generated). If fp32 parity fails, fix the export before
building.

The script prints which precision to ship. `src/assets.ts` `BUNDLE` selects it
(default `int8`); set to `fp32` only if the int8 line says it drifted past
tolerance. The device test should run whichever precision a real app would
carry — that's int8 unless it failed.

## 2. Build the dev client (needs native modules → not Expo Go)

```bash
npm install
npx expo prebuild --clean
npm run ios       # or: npm run android   (physical device — simulators lie)
```

## 3. Run on each physical device

Tap **Run accelerated**, **Run CPU only**, **Check tokenizer parity**. The
screen flags each metric against the §6 thresholds and shows the accel-vs-CPU
speedup. Capture **peak memory** separately in Xcode Instruments / Android
Studio Memory Profiler (not measurable reliably in-app).

## 4. Record the verdict

Fill the §6 table per device and write the 🟢/🟡/🔴 verdict (spike §7-§8). That
page is the input to deciding whether M1 starts.

## What this proves / doesn't

Proves: model load, EP acceleration is real, embed/rerank speed, embedding
tokenizer id-parity. Does **not** touch: PDF extraction, SQLite/sqlite-vec, the
LLM call, real UI (all M1+).

**Reranker tokenizer caveat:** `bge-reranker-base` is XLM-RoBERTa
(SentencePiece), not BERT WordPiece. On-device the spike reuses the WordPiece
tokenizer as a *length proxy* so Rerank×20 **timing** is representative;
reranker **score** parity is validated on the laptop (`export_onnx.py`). If M0
is green and the reranker is kept, M1 must add a SentencePiece tokenizer.
