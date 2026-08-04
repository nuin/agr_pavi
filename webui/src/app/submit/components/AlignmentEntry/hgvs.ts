// Genomic HGVS: RefSeq accession + ":g." + start position + a change suffix
// (>subst, _range del/dup/ins/delins). Requires a change suffix so a bare
// position ("...:g.105521966") is routed to text search, not a doomed lookup.
const GENOMIC_HGVS_RE = /^[A-Za-z0-9_.]+:g\.\d+[A-Za-z_>].*$/;

/** Trim outer whitespace and collapse internal whitespace runs to one space. */
export function normalizeHgvs(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

/** True when `text` (after normalization) looks like a genomic HGVS string. */
export function looksLikeHgvs(text: string): boolean {
    const t = normalizeHgvs(text);
    return GENOMIC_HGVS_RE.test(t);
}
