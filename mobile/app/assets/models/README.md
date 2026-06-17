# Model assets (generated, not committed)

Produced by `mobile/tools/export_onnx.py`. Run it before building the app:

```bash
cd mobile/tools
source ../../backend/.venv/bin/activate
pip install -r requirements.txt
python export_onnx.py            # writes here, into ../m0-spike/assets/models
```

Expected layout after export:

```
bge-small-en-v1.5/
  model.onnx          # embedding, fp32 (~127 MB)
  model.int8.onnx     # embedding, int8 quantized (~32 MB) — default bundle
  vocab.txt           # BERT WordPiece vocab (tokenizer.ts loads this)
  tokenizer.json ...
bge-reranker-base/
  model.onnx          # cross-encoder, fp32 (~1060 MB — too big to ship as-is)
  model.int8.onnx     # cross-encoder, int8 quantized (~270 MB)
  vocab.txt
  tokenizer.json ...
```

CLS pool + L2-norm (embed) and logit->sigmoid (rerank) are applied in JS, not in
the graph. The export script prints fp32+int8 sizes (bundle-vs-download input)
and parity-checks both vs the web app — fp32 must say `PARITY PASSED` before you
build. The fp32 reranker is ~1 GB; ship int8 (`BUNDLE` in `src/assets.ts`) or
drop the reranker (mobile.md §12).
