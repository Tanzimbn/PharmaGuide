# M5 eval — accuracy + score-guard calibration

Off-device harness that calibrates the mobile **cosine** score guard
(`SCORE_THRESHOLD` in `mobile/app/src/config.ts`, FR-Q7) and measures retrieval
accuracy. It reuses the web app's real bge-small + chunk logic
(`backend/app/ingestion`), which the on-device int8 ONNX is parity-checked
against (M0) — so the numbers transfer to the device modulo a small fp32→int8
cosine drift (re-verify the final τ on device).

## 1. Add a corpus

Drop a few **non-confidential** guideline PDFs (NFR-2) into `corpus/`. Keep them
small; they're committed so calibration is reproducible.

## 2. Author the gold set (`gold.json`)

A list of questions, mixing **covered** (answerable from the corpus) and
**not-covered** (off-topic / out-of-corpus — these calibrate the refuse
threshold). Aim for a balanced set (≈ as many negatives as positives).

```json
[
  {
    "question": "What is the acceptance limit for total impurities?",
    "expected_doc": "ICH-Q3A.pdf",
    "expected_pages": [2, 3],
    "covered": true
  },
  {
    "question": "How do I bake sourdough bread?",
    "expected_doc": null,
    "expected_pages": [],
    "covered": false
  }
]
```

- `expected_doc` / `expected_pages` — only used for covered questions
  (recall@k / MRR: was an expected page of that doc in the top-k?).
- `covered: false` — `expected_*` ignored; used only for the threshold sweep.

## 3. Run

```bash
cd mobile/tools/eval
../../../backend/.venv/bin/python run_eval.py
```

Prints recall@k, MRR, the covered-vs-not top-1 cosine distributions, a τ sweep,
and the **recommended `SCORE_THRESHOLD`** (max F1, tie-break toward precision —
refusing beats fabricating). Also writes `report.json` (gitignored).

Then set `SCORE_THRESHOLD` in `mobile/app/src/config.ts` to the recommended τ.
