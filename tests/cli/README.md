# pavi-cli

End-to-end validation harness for PAVI example datasets. Drives the API
directly so pipeline / payload-shape regressions surface even when the
WebUI is broken.

## Setup

```bash
cd tests/cli
make install         # creates .venv, installs pavi-cli in editable mode
make install-test    # same, plus pytest for unit tests
make list            # prints the example catalog
```

`pyproject.toml` requires Python 3.12 — the same version the API uses.

## Verify the Alliance API shape (fast, no pipeline)

The `verify-alliance` command walks every gene (and pinned allele) in
`tests/examples/catalog.json` and checks that the live Alliance API
still returns a parseable response under the v9 shape adapters in
`pavi_cli/alliance_client.py`. This is the cheap CI signal — no
pipeline run, no payload fixture required.

```bash
make verify-alliance                              # full catalog vs prod
make verify-alliance-test                         # full catalog vs test.alliancegenome.org
.venv/bin/pavi-cli verify-alliance --example tp53-orthologs
.venv/bin/pavi-cli verify-alliance --no-alleles   # gene shape only
```

A failure here means either the catalog is out of date (an allele was
retired) or the Alliance API changed shape again. The first is fixed by
editing `catalog.json`; the second by extending the legacy-shape
fallback in `alliance_client.adapt_*`.

### Prod vs test endpoint

CI runs the verification against **both** `https://www.alliancegenome.org`
(prod) and `https://test.alliancegenome.org`. `test` is treated as the
hard signal (red = real catalog or shape regression); `prod` is soft, so
a transient prod-only blip (partial ES re-index, deploy in-flight) does
not block PRs.

If only one of the two is red, compare the JSON reports to localize the
issue before editing the catalog.

## Run the adapter unit tests

```bash
make test
```

These tests use captured JSON fixtures (no network) and lock the
field map so a silent shape regression fails CI immediately.

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

## Phase 2 additions

- `pavi_cli/alliance_client.py` — Python port of the v9 response
  adapters used by the WebUI and pipeline. Adapter functions accept
  the v9 nested shape and fall back to the legacy flat shape so a
  rollback would not break the harness.
- `pavi_cli/verify.py` + the `verify-alliance` command — walks the
  catalog against the live Alliance API to catch shape / catalog
  drift on every PR.
- `.github/workflows/cli-examples-quick.yml` — runs unit tests on
  every PR and the Alliance shape verification nightly.
