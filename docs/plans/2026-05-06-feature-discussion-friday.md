# Pending feature discussion — Friday 2026-05-08

Three items from the working list need product/UX clarification before
implementation can proceed safely. Captured here so the Friday discussion
has concrete questions to anchor on.

## 5. Visualize sequence transcript

**Original ask:** "visualize sequence transcript" (vague).

**Possible interpretations:**

a. **Inline transcript schematic on the result page.**
   Show a per-sequence track depicting exon/CDS layout above or beside the
   alignment, so users can map alignment columns back to genomic transcript
   structure. Closest existing analog: Nightingale's `Track` /
   `LinegraphTrack` components (already used for variants and conservation).

b. **Standalone transcript viewer on submit / preview.**
   When a user picks a transcript in `useTranscriptSelection`, render a
   small JBrowse-style schematic showing the chosen transcript's exons so
   the user can visually confirm before submitting. Would reuse
   `selectedTranscriptsInfo[].exons` and `cds_regions` already collected
   in the hook.

c. **Per-row transcript map in `/jobs` history.**
   Show which transcript each historical job used.

**Open questions for Friday:**
- Where does the transcript visualization live — submit, result, or both?
- Do we need exon/intron schematic, just CDS regions, or full subfeature
  detail (5'/3' UTRs, splice sites)?
- Is this a new Nightingale track type, or a custom SVG component?
- Coordinate space — alignment columns (post-Clustal) or genomic
  coordinates (pre-pipeline)? They are not the same.
- Multi-transcript display — how to lay out N parallel transcript
  diagrams without crowding?

**Existing data we can reuse:**
- `TranscriptInfo` (in `webui/src/app/submit/components/AlignmentEntry/types.ts`)
  carries `exons` and `cds_regions` with `refStart`/`refEnd`/`phase`.
- The pipeline's `seq-info` JSON output already maps genomic regions to
  alignment positions (used today for variant overlay).

## 6. Improve submit ortholog alignment job

**Status:** in active development; small improvements landed alongside
this document. Larger items deferred pending Friday alignment.

**Audit punch list (full set):**

UX (per prior memory feedback "auto-fetch, tighter design, variant
selection per ortholog"):
1. Auto-fetch orthologs on gene select — *DONE in this branch*.
2. Per-ortholog variant selection (allele dropdown per row) — *deferred*.
3. Per-ortholog transcript selection (currently `transcripts[0]` is
   hard-picked, line 154 of `OrthologForm.tsx`) — *deferred*.
4. Tighter design matching `/submit` aesthetic — *partially addressed
   via global theme tightening in commit `a5bc49da`*.

Code quality:
5. Sequential `for-await` over Alliance API → `Promise.all` —
   *DONE in this branch*.
6. `(buildPayloadForGene as any).lastError` anti-pattern → return
   structured result — *DONE in this branch*.
7. Duplicated `jBrowseSubfeatureRelToRefPos` and transcript-payload
   logic between `OrthologForm.tsx` and `useTranscriptSelection.ts` →
   extract shared module — *deferred (touches both files, larger
   refactor; want test coverage first)*.
8. Stale `// eslint-disable-next-line react-hooks/exhaustive-deps` on
   `handleSubmit` (line 208) — *DONE in this branch*.
9. `any` leakage on transcript / subfeature types — *deferred*.
10. Stale `sourceGene` not cleared on gene reselect — *DONE in this
    branch*.
11. `${e}` error rendering produces poor messages — *DONE in this
    branch*.

**Open questions for Friday:**
- For per-ortholog variant selection: do we fetch alleles per ortholog
  (N×Alliance calls) or only on demand when user expands a row?
- For per-ortholog transcript selection: default to longest CDS,
  canonical, or first-returned? Currently first-returned is silent.
- Tighter design — what specifically to align with `/submit`? Card
  spacing, button placement, allele filter UX, or all three?

## 7. Add extra alleles / sequences to a finished alignment

**Original ask:** "add extra alleles/sequences to an already finished /
visualized alignment".

**Architectural questions:**

a. **What does "add" mean?**
   - Re-run the pipeline with the original input plus the new sequences,
     producing a new job UUID? (Simplest; preserves immutability.)
   - In-place augmentation of the existing alignment, projecting new
     sequences onto the fixed columns of the prior alignment? (Hard;
     Clustal Omega supports `--profile1 / --profile2` for this — see
     "profile-profile alignment".)
   - Side-by-side display where the old alignment is read-only and new
     sequences are aligned separately, then visually merged?

b. **Where does the user trigger this?**
   - Button on the result page ("Add sequence...") that opens a sequence
     picker?
   - "Clone & extend" link on `/jobs` that pre-fills `/submit` with the
     prior input?

c. **How do we handle stale results?**
   - If alleles or transcripts have changed in Alliance since the
     original job ran, do we re-fetch or use cached?
   - Job storage (DynamoDB/SQLite — see `docs/configuration-reference.md`)
     keeps the pipeline output but not the original input payload in
     full. Would need to extend storage schema if "clone" is the path.

**Pipeline implications:**
- Current `pipeline_components/alignment/` invokes Clustal Omega on a
  merged FASTA. Profile-profile mode would require a new entry point.
- Step Functions state machine is currently linear (retrieve → align →
  collect). Adding "extend" would need either a parallel branch or a
  separate state machine.
- `seq-info` merging logic (`collectAndAlignSeqInfo`) assumes one
  alignment per job. Multi-stage merging would change this.

**Open questions for Friday:**
- New job vs in-place augmentation — which model?
- If new-job model: do we want a "based on job UUID" parent reference
  for traceability? (Lineage in `/jobs` view.)
- How frequently is this expected to be used — informs whether it
  warrants pipeline work or is acceptable as a "clone & resubmit"
  shortcut?

---

## Implementation log (for reference)

Branch `feature/ortholog-and-variant-improvements`:
- `59afa907` task 1: fix wrong gene IDs in SOD1 and MYH6 examples
- `d46daed0` task 3: auto-filter alleles by selected transcript
- `a5bc49da` task 4: tighten spacing on submit page
- *(pending)* task 6: ortholog page improvements (subset)
