'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { AutoComplete, AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';

import { fetchGeneInfo, fetchGeneSuggestionsAutocomplete } from '@/app/submit/components/AlignmentEntry/serverActions';
import { GeneInfo, GeneSuggestion } from '@/app/submit/components/AlignmentEntry/types';
import { submitNewPipelineJob } from '@/app/submit/components/JobSubmitForm/serverActions';
import { JobSumbissionPayloadRecord } from '@/app/submit/components/JobSubmitForm/types';

import { fetchOrthologs, OrthologInfo } from './serverActions';

import { getSpecies, getSingleGenomeLocation } from 'https://raw.githubusercontent.com/alliance-genome/agr_ui/main/src/lib/utils.js';
import { fetchTranscripts } from 'generic-sequence-panel';
import NCListFeature from '@gmod/nclist';

import styles from './page.module.css';

const AGR_SPECIES_TAXONS = new Set([
    'NCBITaxon:9606',
    'NCBITaxon:10090',
    'NCBITaxon:10116',
    'NCBITaxon:7955',
    'NCBITaxon:7227',
    'NCBITaxon:6239',
    'NCBITaxon:559292',
    'NCBITaxon:8364',
]);

interface OrthologFormProps {
    agrjBrowseDataRelease: string;
}

interface OrthologEntry extends OrthologInfo {
    selected: boolean;
}

type SubmitPhase = 'idle' | 'searching' | 'fetching-genes' | 'fetching-transcripts' | 'submitting' | 'done' | 'error';

export function OrthologForm({ agrjBrowseDataRelease }: OrthologFormProps) {
    const router = useRouter();

    // Gene search state
    const [geneQuery, setGeneQuery] = useState<string>('');
    const [suggestions, setSuggestions] = useState<GeneSuggestion[]>([]);
    const [selectedGene, setSelectedGene] = useState<GeneInfo | null>(null);

    // Ortholog state
    const [orthologs, setOrthologs] = useState<OrthologEntry[]>([]);
    const [orthologsLoading, setOrthologsLoading] = useState(false);
    const [sourceGene, setSourceGene] = useState<OrthologInfo | null>(null);
    const [includeSource, setIncludeSource] = useState(true);

    // Submit state
    const [phase, setPhase] = useState<SubmitPhase>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Gene autocomplete
    const searchGenes = useCallback(async (event: AutoCompleteCompleteEvent) => {
        const query = event.query.trim();
        if (query.length < 2) return;
        const results = await fetchGeneSuggestionsAutocomplete(query);
        setSuggestions(results);
    }, []);

    const onGeneSelect = useCallback(async (value: GeneSuggestion | string) => {
        const geneId = typeof value === 'string' ? value : value.id;
        if (!geneId) return;

        const geneInfo = await fetchGeneInfo(geneId);
        if (geneInfo) {
            setSelectedGene(geneInfo);
            setOrthologs([]);
            setError(null);
        }
    }, []);

    // Find orthologs
    const handleFindOrthologs = useCallback(async () => {
        if (!selectedGene) return;
        setOrthologsLoading(true);
        setError(null);

        try {
            const result = await fetchOrthologs(selectedGene.id);
            setSourceGene(result.sourceGene);
            setOrthologs(result.orthologs.map(o => ({
                ...o,
                selected: AGR_SPECIES_TAXONS.has(o.taxonId),
            })));
        } catch (e) {
            setError(`Failed to fetch orthologs: ${e}`);
        } finally {
            setOrthologsLoading(false);
        }
    }, [selectedGene]);

    const toggleOrtholog = useCallback((geneId: string) => {
        setOrthologs(prev => prev.map(o =>
            o.geneId === geneId ? { ...o, selected: !o.selected } : o
        ));
    }, []);

    const selectAll = useCallback(() => {
        setOrthologs(prev => prev.map(o => ({ ...o, selected: true })));
    }, []);

    const selectNone = useCallback(() => {
        setOrthologs(prev => prev.map(o => ({ ...o, selected: false })));
    }, []);

    const selectAgrOnly = useCallback(() => {
        setOrthologs(prev => prev.map(o => ({
            ...o, selected: AGR_SPECIES_TAXONS.has(o.taxonId),
        })));
    }, []);

    const selectedCount = orthologs.filter(o => o.selected).length + (includeSource ? 1 : 0);

    // Fetch transcript data for a single gene and build payload record
    async function buildPayloadForGene(gene: GeneInfo, index: number): Promise<JobSumbissionPayloadRecord | null> {
        try {
            const speciesConfig = getSpecies(gene.species.taxonId);
            const genomeLocation = getSingleGenomeLocation(gene.genomeLocations);

            const jBrowsenclistbaseurl = speciesConfig.jBrowsenclistbaseurltemplate.replace(
                '{release}', agrjBrowseDataRelease
            );

            const transcripts = await fetchTranscripts({
                refseq: genomeLocation['chromosome'],
                start: genomeLocation['start'],
                end: genomeLocation['end'],
                gene: gene['symbol'],
                urltemplate: speciesConfig.jBrowseurltemplate,
                nclistbaseurl: jBrowsenclistbaseurl,
            });

            if (!transcripts || transcripts.length === 0) {
                console.warn(`No transcripts found for ${gene.symbol}`);
                return null;
            }

            // Pick first transcript
            const transcript = transcripts[0];
            const feature: any = new (NCListFeature as any)(transcript).toJSON();
            const { subfeatures = [] } = feature;

            const children = subfeatures
                .sort((a: { start: number }, b: { start: number }) => a.start - b.start)
                .map((sub: any) => ({
                    ...sub,
                    start: sub.start - feature.start,
                    end: sub.end - feature.start,
                }));

            let exons = children.filter((sub: { type: string }) => sub.type === 'exon');
            let cds_regions = children.filter((sub: { type: string }) => sub.type === 'CDS');

            // Reverse for minus strand
            const transcriptLength = transcript.get('end') - transcript.get('start');
            if (feature.strand === -1) {
                exons = exons.map((e: any) => ({
                    ...e,
                    start: transcriptLength - e.end,
                    end: transcriptLength - e.start,
                }));
                cds_regions = cds_regions.map((c: any) => ({
                    ...c,
                    start: transcriptLength - c.end,
                    end: transcriptLength - c.start,
                }));
            }

            // Convert relative to absolute positions
            const refStart = transcript.get('start');
            const refEnd = transcript.get('end');
            const toAbsolute = (sub: any) => {
                if (feature.strand === -1) {
                    return { refStart: refEnd - sub.end, refEnd: refEnd - sub.start, phase: sub.phase };
                }
                return { refStart: refStart + sub.start, refEnd: refStart + sub.end, phase: sub.phase };
            };

            const absExons = exons.map(toAbsolute);
            const absCds = cds_regions.map(toAbsolute);

            if (absCds.length === 0) {
                console.warn(`No CDS regions for ${gene.symbol} — skipping`);
                return null;
            }

            const transcriptName = (transcript.get('name') as string) ?? gene.symbol;

            return {
                unique_entry_id: `${index}_${gene.symbol}_${transcriptName}`,
                base_seq_name: `${gene.symbol}_${transcriptName}`,
                seq_id: genomeLocation['chromosome'],
                seq_strand: feature.strand === -1 ? '-' : '+',
                exon_seq_regions: absExons.map((e: any) => ({ start: e.refStart, end: e.refEnd })),
                cds_seq_regions: absCds.map((c: any) => ({ start: c.refStart, end: c.refEnd, frame: c.phase ?? 0 })),
                fasta_file_url: speciesConfig.jBrowsefastaurl,
                variant_ids: [],
                species: gene.species.name,
            };
        } catch (e) {
            console.error(`Failed to build payload for ${gene.symbol}:`, e);
            return null;
        }
    }

    // Submit job
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleSubmit = useCallback(async () => {
        const selectedOrthologs = orthologs.filter(o => o.selected);
        const allGeneIds = [
            ...(includeSource && sourceGene ? [sourceGene.geneId] : []),
            ...selectedOrthologs.map(o => o.geneId),
        ];

        if (allGeneIds.length < 2) {
            setError('At least 2 sequences are required for alignment.');
            return;
        }

        setPhase('fetching-genes');
        setError(null);

        try {
            // Fetch gene info for each
            setStatusMessage(`Fetching gene info for ${allGeneIds.length} genes...`);
            const geneInfos: GeneInfo[] = [];
            for (const geneId of allGeneIds) {
                const info = await fetchGeneInfo(geneId);
                if (info) geneInfos.push(info);
            }

            if (geneInfos.length < 2) {
                setError(`Only ${geneInfos.length} gene(s) could be resolved. Need at least 2.`);
                setPhase('error');
                return;
            }

            // Fetch transcripts and build payloads
            setPhase('fetching-transcripts');
            const payloads: JobSumbissionPayloadRecord[] = [];
            for (let i = 0; i < geneInfos.length; i++) {
                setStatusMessage(`Fetching transcripts for ${geneInfos[i].symbol} (${i + 1}/${geneInfos.length})...`);
                const record = await buildPayloadForGene(geneInfos[i], i);
                if (record) payloads.push(record);
            }

            if (payloads.length < 2) {
                setError(`Only ${payloads.length} gene(s) had valid transcripts. Need at least 2.`);
                setPhase('error');
                return;
            }

            // Submit
            setPhase('submitting');
            setStatusMessage('Submitting alignment job...');
            const job = await submitNewPipelineJob(payloads);
            setPhase('done');
            router.push(`/progress?uuid=${job.uuid}`);
        } catch (e) {
            setError(`Submission failed: ${e}`);
            setPhase('error');
        }
    }, [orthologs, includeSource, sourceGene, router, agrjBrowseDataRelease]);

    return (
        <div className={styles.container}>
            <p className={styles.subtitle}>
                Enter a gene to find orthologs across model organisms and submit a multi-species protein alignment.
            </p>

            {/* Gene Search */}
            <div className={styles.section}>
                <div className={styles.sectionLabel}>Gene</div>
                <div className={styles.geneSearchRow}>
                    <AutoComplete
                        value={geneQuery}
                        suggestions={suggestions}
                        completeMethod={searchGenes}
                        field="name"
                        onChange={(e) => setGeneQuery(typeof e.value === 'string' ? e.value : e.value?.displayName || '')}
                        onSelect={(e) => onGeneSelect(e.value)}
                        placeholder="Search for a gene (e.g., SOD1, TP53, PITX2)"
                        style={{ width: '100%' }}
                    />
                    <Button
                        label="Find Orthologs"
                        icon="pi pi-search"
                        onClick={handleFindOrthologs}
                        disabled={!selectedGene || orthologsLoading}
                        loading={orthologsLoading}
                    />
                </div>
                {selectedGene && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--agr-gray-500)' }}>
                        Selected: <strong>{selectedGene.symbol}</strong> ({selectedGene.species?.name}) &mdash; {selectedGene.id}
                    </div>
                )}
            </div>

            {/* Ortholog List */}
            {orthologs.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionLabel}>
                        Orthologs for {selectedGene?.symbol} ({orthologs.length} found)
                    </div>

                    <div className={styles.batchActions}>
                        <Button label="Select All" size="small" severity="secondary" outlined onClick={selectAll} />
                        <Button label="AGR Species Only" size="small" severity="secondary" outlined onClick={selectAgrOnly} />
                        <Button label="Clear" size="small" severity="secondary" outlined onClick={selectNone} />
                    </div>

                    {/* Source gene */}
                    {sourceGene && (
                        <div className={styles.orthologItem} onClick={() => setIncludeSource(!includeSource)}>
                            <Checkbox checked={includeSource} onChange={() => setIncludeSource(!includeSource)} />
                            <span className={styles.orthologSymbol}>{sourceGene.symbol}</span>
                            <span className={styles.orthologSpecies}>{sourceGene.species}</span>
                            <span className={styles.orthologId}>{sourceGene.geneId}</span>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--agr-primary-500)', fontWeight: 600 }}>SOURCE</span>
                        </div>
                    )}

                    <div className={styles.orthologList}>
                        {orthologs.map(o => (
                            <div key={o.geneId} className={styles.orthologItem} onClick={() => toggleOrtholog(o.geneId)}>
                                <Checkbox checked={o.selected} onChange={() => toggleOrtholog(o.geneId)} />
                                <span className={styles.orthologSymbol}>{o.symbol}</span>
                                <span className={styles.orthologSpecies}>{o.species}</span>
                                <span className={styles.orthologId}>{o.geneId}</span>
                            </div>
                        ))}
                    </div>

                    <div className={styles.selectedCount}>
                        {selectedCount} sequence{selectedCount !== 1 ? 's' : ''} selected
                    </div>

                    {/* Submit */}
                    <div className={styles.submitSection}>
                        <Button
                            label="Submit Alignment"
                            icon="pi pi-play"
                            onClick={handleSubmit}
                            disabled={selectedCount < 2 || phase !== 'idle'}
                            loading={phase !== 'idle' && phase !== 'error' && phase !== 'done'}
                        />
                        {statusMessage && phase !== 'idle' && phase !== 'error' && (
                            <span className={styles.statusMessage}>
                                <i className="pi pi-spin pi-spinner" style={{ marginRight: '0.5rem' }} />
                                {statusMessage}
                            </span>
                        )}
                    </div>

                    {error && <div className={styles.errorMessage}>{error}</div>}
                </div>
            )}

            {orthologs.length === 0 && selectedGene && !orthologsLoading && (
                <div style={{ color: 'var(--agr-gray-400)', fontSize: '0.875rem', marginTop: '1rem' }}>
                    Click &quot;Find Orthologs&quot; to discover orthologous genes across species.
                </div>
            )}
        </div>
    );
}
