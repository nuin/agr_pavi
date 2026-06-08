# pavi-cli

End-to-end validation harness for PAVI example datasets. Drives the API
directly so pipeline / payload-shape regressions surface even when the
WebUI is broken.

## Setup

```bash
cd tests/cli
make install     # creates .venv, installs pavi-cli in editable mode
make list        # prints the example catalog
```

`pyproject.toml` requires Python 3.12 — the same version the API uses.

## Capture a payload fixture (one-time per example)

The runner submits a *captured* pipeline payload against a live API,
rather than re-deriving it from gene IDs (which would require porting
the WebUI's JBrowse transcript-resolution path to Python). To capture a
fixture, run a successful example via the WebUI in local-pipeline mode,
then snapshot it:

```bash
# 1. Run the example via http://localhost:3000/submit → "Load Example",
#    pick e.g. "TP53 Orthologs", submit, wait until complete.

# 2. Grab the job UUID from the result page URL and snapshot it:
make capture-payload EXAMPLE=tp53-orthologs JOB_UUID=<uuid>

# 3. Commit the new fixture:
git add ../examples/fixtures/tp53-orthologs/payload.json
```

The capture step reads `input_data` from the API's local SQLite job
store at `${PAVI_LOCAL_JOBS_PATH:-/tmp/pavi/jobs}/jobs.db`.

## Run one example

```bash
make run-quick EXAMPLE=tp53-orthologs
```

Output:

```
  ✓ tp53-orthologs                   18.4s  seqs=3  maxId=78.2%  variants=0

1/1 examples passed, 0 failed.
```

## Run every example

```bash
make run-all
```

Produces a per-example pass/fail summary plus
`run-all-report.json` (the same JSON shape used in CI).

## Assertions

Tolerant by design — Alliance data drift over time will shift exact
identity percentages, so we only assert biologically sane bounds rather
than golden-file diffs. Each example carries an `expectations` block in
`tests/examples/catalog.json`:

| Field | What it asserts |
|---|---|
| `minSequenceCount` | `aligned_seq_info.json` has at least this many sequences. |
| `minMaxPairwiseIdentityPct` | The *most-similar* pair clears this %. Identity is computed in-process from the alignment. |
| `minEmbeddedVariantsTotal` | Sum of `embedded_variants` across the alignment. Examples without `alleleIds` set this to 0. |
| `expectedConsequenceCategories` | Every entry must appear in at least one variant's `molecular_consequences`. |

See `tests/examples/types.ts` for the schema and
`pavi_cli/assertions.py` for the implementation.

## Limits of Phase 1

- Payloads are captured snapshots, not re-derived. A break in the WebUI
  payload-building path (gene info / transcript / allele resolution)
  will not surface here — only pipeline-layer breaks will. Playwright
  (Phase 3) covers the WebUI path.
- The harness assumes local-pipeline mode. Step Functions / Nextflow
  modes are out of scope for Phase 1.
- Strict golden-file diff is intentionally not implemented yet — see
  the open-questions section of
  `docs/plans/2026-06-08-example-validation-and-e2e-testing.md`.
