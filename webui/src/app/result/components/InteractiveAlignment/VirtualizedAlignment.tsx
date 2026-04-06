'use client';

import React, {
    FunctionComponent,
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef
} from 'react';

import { parse } from 'clustal-js';

import NightingaleMSAComponent, {
    dataPropType as MSADataProp,
    featuresPropType as MSAFeaturesProp
} from './nightingale/MSA';
import NightingaleManagerComponent from './nightingale/Manager';
import NightingaleNavigationComponent from './nightingale/Navigation';
import NightingaleTrackComponent, {
    dataPropType as TrackDataProp
} from './nightingale/Track';
import NightingaleLinegraphTrack, { LineData } from './nightingale/LinegraphTrack';

import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';

import { SeqInfoDict } from './types';
import styles from './VirtualizedAlignment.module.css';

// Constants for virtualization and display
const SEQUENCE_HEIGHT = 40; // Height per sequence in pixels (larger for readability)
const TILE_HEIGHT = 36; // Height of each amino acid tile (default is 20)
const TILE_WIDTH = 28; // Width of each amino acid tile (default is 20)
const OVERSCAN = 10; // Number of extra sequences to render above/below viewport
const MIN_VISIBLE_SEQUENCES = 30; // Minimum sequences to show at once

interface ColorSchemeSelectItem {
    label: string;
    value: string;
}

interface ColorSchemeSelectGroup {
    groupLabel: string;
    items: ColorSchemeSelectItem[];
}

export interface VirtualizedAlignmentProps {
    readonly alignmentResult: string;
    readonly seqInfoDict: SeqInfoDict;
    readonly jobUuid?: string;
}

const VirtualizedAlignment: FunctionComponent<VirtualizedAlignmentProps> = (
    props: VirtualizedAlignmentProps
) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const variantTrackRef = useRef<HTMLDivElement>(null);
    const [variantTrackWidth, setVariantTrackWidth] = useState(0);

    const [alignmentColorScheme, setAlignmentColorScheme] = useState<string>('clustal2');
    // Overlay toggles (Tier 1: SAB mockup "Show:" panel)
    const [showConservation, setShowConservation] = useState<boolean>(false);
    const [showVariantLocations, setShowVariantLocations] = useState<boolean>(true);
    const [showProteinDomains, setShowProteinDomains] = useState<boolean>(false);
    const [showExonBoundaries, setShowExonBoundaries] = useState<boolean>(false);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(600);
    const [referenceIndex, setReferenceIndex] = useState<number>(0); // Index of sequence to show at top

    // Get species abbreviation (e.g., "Homo sapiens" -> "H. sapiens")
    const getSpeciesAbbrev = (species: string): string => {
        const parts = species.split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
        }
        return species;
    };

    // Parse alignment data and append species to names
    // Also build a map from display name back to original ID for lookups
    const { fullAlignmentData, displayNameToId } = useMemo<{
        fullAlignmentData: MSADataProp;
        displayNameToId: Map<string, string>;
    }>(() => {
        if (!props.alignmentResult) return { fullAlignmentData: [], displayNameToId: new Map() };
        const parsedAlignment = parse(props.alignmentResult);
        const nameMap = new Map<string, string>();
        const data = parsedAlignment['alns'].map((aln: { id: string; seq: string }) => {
            // Look up species for this sequence
            const seqInfo = props.seqInfoDict[aln.id];
            const species = seqInfo?.species;
            const displayName = species
                ? `${aln.id} [${getSpeciesAbbrev(species)}]`
                : aln.id;
            nameMap.set(displayName, aln.id);
            return {
                sequence: aln.seq,
                name: displayName
            };
        });
        return { fullAlignmentData: data, displayNameToId: nameMap };
    }, [props.alignmentResult, props.seqInfoDict]);

    // Reorder alignment data to put reference sequence at top
    const orderedAlignmentData = useMemo<MSADataProp>(() => {
        if (fullAlignmentData.length === 0 || referenceIndex === 0) {
            return fullAlignmentData;
        }
        // Move the reference sequence to the top
        const reordered = [...fullAlignmentData];
        const [refSeq] = reordered.splice(referenceIndex, 1);
        reordered.unshift(refSeq);
        return reordered;
    }, [fullAlignmentData, referenceIndex]);

    // Handler to promote a sequence to reference (top)
    const promoteToReference = useCallback((index: number) => {
        // The index is relative to orderedAlignmentData, need to find original index
        if (index === 0) return; // Already at top

        // Find the sequence name at this position in ordered data
        const seqName = orderedAlignmentData[index]?.name;
        if (!seqName) return;

        // Find its original index in fullAlignmentData
        const originalIndex = fullAlignmentData.findIndex(s => s.name === seqName);
        if (originalIndex >= 0) {
            setReferenceIndex(originalIndex);
        }
    }, [orderedAlignmentData, fullAlignmentData]);

    // Calculate sequence length
    const seqLength = useMemo(() => {
        return fullAlignmentData.reduce((maxLength, alignment) => {
            return Math.max(maxLength, alignment.sequence.length);
        }, 0);
    }, [fullAlignmentData]);

    // Calculate visible range based on scroll position
    const { visibleData, virtualOffset } = useMemo(() => {
        const totalSequences = orderedAlignmentData.length;
        const viewportSequences = Math.ceil(containerHeight / SEQUENCE_HEIGHT);
        const visibleCount = Math.max(MIN_VISIBLE_SEQUENCES, viewportSequences + OVERSCAN * 2);

        // Calculate start index based on scroll
        let startIdx = Math.floor(scrollTop / SEQUENCE_HEIGHT) - OVERSCAN;
        startIdx = Math.max(0, startIdx);

        // Don't virtualize if we have fewer sequences than would fill the container
        if (totalSequences <= visibleCount) {
            return {
                visibleData: orderedAlignmentData,
                virtualOffset: 0
            };
        }

        let endIdx = startIdx + visibleCount;
        endIdx = Math.min(totalSequences, endIdx);

        return {
            visibleData: orderedAlignmentData.slice(startIdx, endIdx),
            virtualOffset: startIdx * SEQUENCE_HEIGHT
        };
    }, [orderedAlignmentData, scrollTop, containerHeight]);

    // Get ALL variants for the overview bar (not just visible sequences)
    const allVariantsTrackData = useMemo(() => {
        const trackData: TrackDataProp = [];

        for (const [_seqId, seqInfo] of Object.entries(props.seqInfoDict)) {
            if (seqInfo.embedded_variants) {
                for (const variant of seqInfo.embedded_variants) {
                    trackData.push({
                        accession: variant.variant_id,
                        start: variant.alignment_start_pos,
                        end: variant.alignment_end_pos,
                        color: '#3b82f6',
                        shape: 'circle' as const
                    });
                }
            }
        }
        return trackData;
    }, [props.seqInfoDict]);

    // Update alignment features for visible sequences only
    const alignmentFeatures = useMemo(() => {
        const features: MSAFeaturesProp = [];

        for (let i = 0; i < visibleData.length; i++) {
            const displayName = visibleData[i].name;
            // Look up original ID from display name
            const originalId = displayNameToId.get(displayName) || displayName;
            if (
                originalId in props.seqInfoDict &&
                'embedded_variants' in props.seqInfoDict[originalId]
            ) {
                for (const embedded_variant of props.seqInfoDict[originalId][
                    'embedded_variants'
                ] || []) {
                    // Add variant to alignment features (relative to visible window)
                    features.push({
                        residues: {
                            from: embedded_variant.alignment_start_pos,
                            to: embedded_variant.alignment_end_pos
                        },
                        sequences: {
                            from: i,
                            to: i
                        },
                        id: `feature_${originalId}_${embedded_variant.variant_id}`,
                        borderColor: '#ef4444',
                        fillColor: 'rgba(239, 68, 68, 0.3)',
                        mouseOverBorderColor: '#dc2626',
                        mouseOverFillColor: 'rgba(220, 38, 38, 0.4)'
                    });
                }
            }
        }

        return features;
    }, [visibleData, props.seqInfoDict, displayNameToId]);

    // Calculate label width based on max name length
    const labelWidth = useMemo(() => {
        const maxLabelLength = fullAlignmentData.reduce((maxLength, alignment) => {
            return Math.max(maxLength, alignment.name.length);
        }, 0);
        return Math.max(maxLabelLength * 9, 100);
    }, [fullAlignmentData]);

    // Extract allele information for display
    const alleleInfo = useMemo(() => {
        const alleles: Array<{
            seqName: string;
            variantId: string;
            refSeq: string;
            altSeq: string;
            position: string;
            type: string;
            alignmentPos: number;
        }> = [];

        for (const [seqName, seqInfo] of Object.entries(props.seqInfoDict)) {
            if (seqInfo.embedded_variants) {
                for (const variant of seqInfo.embedded_variants) {
                    alleles.push({
                        seqName,
                        variantId: variant.variant_id,
                        refSeq: variant.genomic_ref_seq || '-',
                        altSeq: variant.genomic_alt_seq || '-',
                        position: `${variant.genomic_seq_id}:${variant.genomic_start_pos}-${variant.genomic_end_pos}`,
                        type: variant.seq_substitution_type,
                        alignmentPos: variant.alignment_start_pos
                    });
                }
            }
        }
        return alleles;
    }, [props.seqInfoDict]);

    // Calculate conservation scores for each position
    const conservationData = useMemo<LineData[]>(() => {
        if (fullAlignmentData.length < 2 || seqLength === 0) return [];

        const values: Array<{ position: number; value: number }> = [];

        for (let pos = 0; pos < seqLength; pos++) {
            // Count residues at this position
            const residueCounts: Map<string, number> = new Map();
            let totalNonGap = 0;

            for (const seq of fullAlignmentData) {
                const residue = seq.sequence[pos];
                if (residue && residue !== '-' && residue !== '.') {
                    residueCounts.set(residue, (residueCounts.get(residue) || 0) + 1);
                    totalNonGap++;
                }
            }

            // Calculate conservation as percentage of most common residue
            let maxCount = 0;
            residueCounts.forEach(count => {
                if (count > maxCount) maxCount = count;
            });

            // Conservation score: percentage of sequences with the most common residue
            const score = totalNonGap > 0 ? (maxCount / fullAlignmentData.length) * 100 : 0;

            values.push({
                position: pos + 1, // 1-based position
                value: score
            });
        }

        return [{
            name: 'Conservation',
            range: [0, 100],
            color: '#2563eb',
            fill: 'rgba(37, 99, 235, 0.15)',
            lineCurve: 'curveMonotoneX',
            values
        }];
    }, [fullAlignmentData, seqLength]);

    // Display range state
    const [displayStart, setDisplayStart] = useState<number>(1);
    const [displayEnd, setDisplayEnd] = useState<number>(100); // Default to reasonable value

    type updateRangeArgs = {
        displayStart?: number;
        displayEnd?: number;
    };
    const updateDisplayRange = useCallback((args: updateRangeArgs) => {
        if (args.displayStart !== undefined) {
            setDisplayStart(args.displayStart);
        }
        if (args.displayEnd !== undefined) {
            setDisplayEnd(args.displayEnd);
        }
    }, []);

    const updateAlignmentColorScheme = useCallback((newColorScheme: string) => {
        setAlignmentColorScheme(newColorScheme);
    }, []);

    // Color scheme options - organized by category
    const aminoAcidcolorSchemeOptions: ColorSchemeSelectGroup[] = [
        {
            groupLabel: 'Recommended',
            items: [
                { label: 'Clustal2', value: 'clustal2' },
                { label: 'Conservation', value: 'conservation' }
            ]
        },
        {
            groupLabel: 'Physical Properties',
            items: [
                { label: 'Hydrophobicity', value: 'hydro' },
                { label: 'Charged', value: 'charged' },
                { label: 'Polar', value: 'polar' },
                { label: 'Aliphatic', value: 'aliphatic' },
                { label: 'Aromatic', value: 'aromatic' },
                { label: 'Positive', value: 'positive' },
                { label: 'Negative', value: 'negative' }
            ]
        },
        {
            groupLabel: 'Structural',
            items: [
                { label: 'Buried Index', value: 'buried_index' },
                { label: 'Helix Propensity', value: 'helix_propensity' },
                { label: 'Strand Propensity', value: 'strand_propensity' },
                { label: 'Turn Propensity', value: 'turn_propensity' }
            ]
        },
        {
            groupLabel: 'Classic Schemes',
            items: [
                { label: 'Taylor', value: 'taylor' },
                { label: 'Zappo', value: 'zappo' },
                { label: 'Lesk', value: 'lesk' },
                { label: 'Cinema', value: 'cinema' },
                { label: 'Mae', value: 'mae' }
            ]
        }
    ];

    const itemGroupTemplate = (option: ColorSchemeSelectGroup) => {
        return (
            <div className={styles.colorSchemeGroup}>
                {option.groupLabel}
            </div>
        );
    };

    // Handle scroll
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    // Keyboard navigation handler
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const visibleRange = displayEnd - displayStart;
        const panStep = Math.max(1, Math.floor(visibleRange * 0.1)); // 10% of visible range
        const zoomStep = Math.max(1, Math.floor(visibleRange * 0.2)); // 20% zoom per step

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                setDisplayStart(prev => Math.max(1, prev - panStep));
                setDisplayEnd(prev => Math.max(visibleRange + 1, prev - panStep));
                break;
            case 'ArrowRight':
                e.preventDefault();
                setDisplayStart(prev => Math.min(seqLength - visibleRange, prev + panStep));
                setDisplayEnd(prev => Math.min(seqLength, prev + panStep));
                break;
            case 'ArrowUp':
                // Scroll up in virtualized list
                e.preventDefault();
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = Math.max(0, scrollTop - SEQUENCE_HEIGHT * 3);
                }
                break;
            case 'ArrowDown':
                // Scroll down in virtualized list
                e.preventDefault();
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = scrollTop + SEQUENCE_HEIGHT * 3;
                }
                break;
            case '+':
            case '=':
                // Zoom in (show fewer residues)
                e.preventDefault();
                if (visibleRange > 10) {
                    const center = Math.floor((displayStart + displayEnd) / 2);
                    const newRange = Math.max(10, visibleRange - zoomStep);
                    const halfRange = Math.floor(newRange / 2);
                    setDisplayStart(Math.max(1, center - halfRange));
                    setDisplayEnd(Math.min(seqLength, center + halfRange));
                }
                break;
            case '-':
            case '_':
                // Zoom out (show more residues)
                e.preventDefault();
                {
                    const center = Math.floor((displayStart + displayEnd) / 2);
                    const newRange = Math.min(seqLength, visibleRange + zoomStep);
                    const halfRange = Math.floor(newRange / 2);
                    setDisplayStart(Math.max(1, center - halfRange));
                    setDisplayEnd(Math.min(seqLength, center + halfRange));
                }
                break;
            case 'Home':
                e.preventDefault();
                setDisplayStart(1);
                setDisplayEnd(Math.min(seqLength, 1 + visibleRange));
                break;
            case 'End':
                e.preventDefault();
                setDisplayEnd(seqLength);
                setDisplayStart(Math.max(1, seqLength - visibleRange));
                break;
        }
    }, [displayStart, displayEnd, seqLength, scrollTop]);

    // Update container height on mount and resize
    useEffect(() => {
        const updateHeight = () => {
            if (containerRef.current) {
                setContainerHeight(containerRef.current.clientHeight);
            }
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    // Track variant track container width for pixel-accurate positioning
    useEffect(() => {
        if (!variantTrackRef.current) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setVariantTrackWidth(entry.contentRect.width);
            }
        });
        ro.observe(variantTrackRef.current);
        return () => ro.disconnect();
    }, []);

    // Update zoom to show readable sequence at centre of alignment
    useEffect(() => {
        if (seqLength === 0) return;

        const initDisplayCenter = Math.round(seqLength / 2);
        // Show fewer positions initially for better readability (50 instead of 150)
        const halfWindow = 25;
        const newDisplayStart = seqLength <= halfWindow * 2 ? 1 : initDisplayCenter - halfWindow;
        const newDisplayEnd = seqLength <= halfWindow * 2 ? seqLength : initDisplayCenter + halfWindow;

        setDisplayStart(newDisplayStart);
        setDisplayEnd(newDisplayEnd);
    }, [seqLength]);

    // Total height for scroll container
    const totalHeight = orderedAlignmentData.length * SEQUENCE_HEIGHT;

    // Height of visible MSA component
    const visibleMsaHeight = visibleData.length * SEQUENCE_HEIGHT;

    // Get variant type class
    const getVariantTypeClass = (type: string): string => {
        if (type === 'deletion') return styles.deletion;
        if (type === 'insertion') return styles.insertion;
        return styles.substitution;
    };

    return (
        <div
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="application"
            aria-label="Alignment viewer. Use arrow keys to pan, +/- to zoom, Home/End to jump to start/end"
            className={styles.alignmentContainer}
        >
            {/* Variant Information Panel */}
            {alleleInfo.length > 0 && (
                <div className={styles.variantPanel}>
                    <div className={styles.variantPanelHeader}>
                        <div className={styles.variantIcon}>
                            <i className="pi pi-bolt" aria-hidden="true" />
                        </div>
                        <span className={styles.variantTitle}>Variant Information</span>
                        <span className={styles.variantCount}>
                            {alleleInfo.length} variant{alleleInfo.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className={styles.variantGrid}>
                        {alleleInfo.map((allele, idx) => (
                            <div
                                key={idx}
                                className={`${styles.variantCard} ${styles.variantCardClickable}`}
                                onClick={() => {
                                    const windowSize = Math.max(20, displayEnd - displayStart);
                                    const newStart = Math.max(1, allele.alignmentPos - Math.floor(windowSize / 2));
                                    const newEnd = Math.min(seqLength, newStart + windowSize);
                                    setDisplayStart(newStart);
                                    setDisplayEnd(newEnd);
                                }}
                                title={`Click to jump to alignment position ${allele.alignmentPos}`}
                            >
                                <div className={styles.variantId}>
                                    <span className={styles.variantNumber}>{idx + 1}</span>
                                    {allele.variantId}
                                </div>
                                <div className={styles.variantDetails}>
                                    <span className={styles.variantChange}>
                                        {allele.refSeq} → {allele.altSeq}
                                    </span>
                                    <span className={`${styles.variantTypeBadge} ${getVariantTypeClass(allele.type)}`}>
                                        {allele.type}
                                    </span>
                                </div>
                                <div className={styles.variantPosition}>
                                    {allele.position}
                                    <span className={styles.variantAlnPos}>alignment pos {allele.alignmentPos}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarSection}>
                    <span className={styles.toolbarLabel}>Color:</span>
                    <Dropdown
                        id="dd-colorscheme"
                        placeholder="Select color scheme"
                        value={alignmentColorScheme}
                        onChange={(e) => updateAlignmentColorScheme(e.value)}
                        options={aminoAcidcolorSchemeOptions}
                        optionGroupChildren="items"
                        optionGroupLabel="groupLabel"
                        optionGroupTemplate={itemGroupTemplate}
                        className={styles.colorSchemeDropdown}
                    />
                </div>

                <div className={styles.overlayPanel}>
                    <span className={styles.overlayPanelLabel}>Show:</span>
                    <label className={styles.overlayToggle}>
                        <input
                            type="checkbox"
                            checked={showVariantLocations}
                            onChange={(e) => setShowVariantLocations(e.target.checked)}
                        />
                        <span>Variant Locations</span>
                    </label>
                    <label className={styles.overlayToggle}>
                        <input
                            type="checkbox"
                            checked={showConservation}
                            onChange={(e) => setShowConservation(e.target.checked)}
                        />
                        <span>Conservation</span>
                    </label>
                    <label className={`${styles.overlayToggle} ${styles.overlayDisabled}`}>
                        <input
                            type="checkbox"
                            checked={showProteinDomains}
                            onChange={(e) => setShowProteinDomains(e.target.checked)}
                            disabled
                        />
                        <span>Protein Domains</span>
                    </label>
                    <label className={`${styles.overlayToggle} ${styles.overlayDisabled}`}>
                        <input
                            type="checkbox"
                            checked={showExonBoundaries}
                            onChange={(e) => setShowExonBoundaries(e.target.checked)}
                            disabled
                        />
                        <span>Exon Boundaries</span>
                    </label>
                </div>

                <span className={styles.sequenceCount}>
                    <strong>{visibleData.length}</strong> of <strong>{fullAlignmentData.length}</strong> sequences
                </span>

                <div className={styles.keyboardHints} aria-hidden="true">
                    <span className={styles.keyHint}><kbd>←</kbd><kbd>→</kbd> pan</span>
                    <span className={styles.keyHint}><kbd>↑</kbd><kbd>↓</kbd> scroll</span>
                    <span className={styles.keyHint}><kbd>+</kbd><kbd>-</kbd> zoom</span>
                    <span className={styles.keyHint}><kbd>Home</kbd><kbd>End</kbd> jump</span>
                </div>

                {props.jobUuid && (
                    <Button
                        icon="pi pi-external-link"
                        label="Full Screen"
                        className={`p-button-sm p-button-outlined ${styles.fullScreenButton}`}
                        onClick={() => {
                            const params = new URLSearchParams();
                            params.set('uuid', props.jobUuid!);
                            window.open(`/alignment?${params.toString()}`, '_blank');
                        }}
                    />
                )}
            </div>

            {/* Alignment View */}
            <div className={styles.alignmentViewWrapper}>
                {/* Variant position buttons removed — cards in info panel handle navigation */}

                {/* Sequence selector for reordering — above the tracks */}
                {orderedAlignmentData.length > 1 && (
                    <div className={styles.sequenceSelector}>
                        {orderedAlignmentData.map((seq, idx) => (
                            <button
                                key={seq.name}
                                className={`${styles.sequenceChip} ${idx === 0 ? styles.isReference : ''}`}
                                onClick={() => promoteToReference(idx)}
                                title={idx === 0 ? 'Reference sequence (at top)' : 'Click to move to top'}
                            >
                                {seq.name}
                            </button>
                        ))}
                    </div>
                )}

                <NightingaleManagerComponent reflected-attributes="display-start,display-end">
                    {/* Position Navigator */}
                    <div className={styles.trackContainer}>
                        <div className={styles.trackLabel}>Position Navigator</div>
                        <div className={styles.navigationTrack} style={{ paddingLeft: labelWidth + 'px' }}>
                            <NightingaleNavigationComponent
                                ruler-padding={0}
                                margin-left={0}
                                margin-right={5}
                                height={40}
                                length={seqLength}
                                display-start={displayStart}
                                display-end={displayEnd}
                                onChange={(e) =>
                                    updateDisplayRange({
                                        displayStart: e.detail['display-start'],
                                        displayEnd: e.detail['display-end']
                                    })
                                }
                            />
                        </div>
                    </div>

                    {/* Conservation track */}
                    {showConservation && conservationData.length > 0 && (
                        <div className={styles.trackContainer}>
                            <div className={styles.trackLabel}>Conservation (%)</div>
                            <div className={styles.conservationTrack} style={{ paddingLeft: labelWidth + 'px' }}>
                                <NightingaleLinegraphTrack
                                    data={conservationData}
                                    display-start={displayStart}
                                    display-end={displayEnd}
                                    length={seqLength}
                                    height={60}
                                    margin-left={0}
                                    margin-right={5}
                                />
                            </div>
                        </div>
                    )}

                    {/* Variant track — numbered circles using Nightingale's positioning formula */}
                    {showVariantLocations && allVariantsTrackData.length > 0 && (
                        <div className={styles.trackContainer}>
                            <div className={styles.trackLabel}>Variants</div>
                            <div
                                ref={variantTrackRef}
                                className={styles.variantTrack}
                                style={{ marginLeft: labelWidth + 'px', marginRight: '5px' }}
                            >
                                {variantTrackWidth > 0 && allVariantsTrackData.map((variant, idx) => {
                                    const pos = variant.start ?? 1;
                                    if (pos < displayStart || pos > displayEnd) return null;
                                    // Nightingale formula: X = W * (P - DS + 0.5) / (DE - DS + 1)
                                    const viewSpan = displayEnd - displayStart + 1;
                                    const pixelX = variantTrackWidth * (pos - displayStart + 0.5) / viewSpan;
                                    return (
                                        <div
                                            key={idx}
                                            className={styles.variantCircle}
                                            style={{ left: pixelX + 'px' }}
                                        >
                                            {idx + 1}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* MSA container */}
                    <div className={styles.trackContainer}>
                        <div className={styles.trackLabel}>Sequence Alignment</div>
                        <div className={styles.msaContainer}>
                            {orderedAlignmentData.length === 0 || seqLength === 0 ? (
                                <div className={styles.loadingState}>
                                    <i className="pi pi-spin pi-spinner" aria-hidden="true" />
                                    <span>Loading alignment...</span>
                                </div>
                            ) : orderedAlignmentData.length <= MIN_VISIBLE_SEQUENCES ? (
                                <NightingaleMSAComponent
                                    label-width={labelWidth}
                                    data={orderedAlignmentData}
                                    features={alignmentFeatures}
                                    height={orderedAlignmentData.length * SEQUENCE_HEIGHT}
                                    tile-height={TILE_HEIGHT}
                                    tile-width={TILE_WIDTH}
                                    margin-left={0}
                                    margin-right={5}
                                    display-start={displayStart}
                                    display-end={displayEnd}
                                    length={seqLength}
                                    colorScheme={alignmentColorScheme}
                                    overlay-conservation={showConservation}
                                    onChange={(e) =>
                                        updateDisplayRange({
                                            displayStart: e.detail['display-start'],
                                            displayEnd: e.detail['display-end']
                                        })
                                    }
                                />
                            ) : (
                                <div
                                    ref={scrollContainerRef}
                                    onScroll={handleScroll}
                                    className={styles.msaScrollContainer}
                                    style={{
                                        height: `${Math.min(containerHeight - 100, totalHeight)}px`,
                                        maxHeight: '500px',
                                        ['--label-width' as string]: `${labelWidth}px`
                                    }}
                                >
                                    {/* Total height spacer for scrollbar */}
                                    <div
                                        className={styles.msaSpacer}
                                        style={{ height: `${totalHeight}px` }}
                                    />

                                    {/* Positioned MSA content */}
                                    <div
                                        className={styles.msaContent}
                                        style={{ top: `${virtualOffset}px` }}
                                    >
                                        <NightingaleMSAComponent
                                            label-width={labelWidth}
                                            data={visibleData}
                                            features={alignmentFeatures}
                                            height={visibleMsaHeight}
                                            tile-height={TILE_HEIGHT}
                                            tile-width={TILE_WIDTH}
                                            margin-left={0}
                                            margin-right={5}
                                            display-start={displayStart}
                                            display-end={displayEnd}
                                            length={seqLength}
                                            colorScheme={alignmentColorScheme}
                                            overlay-conservation={showConservation}
                                            onChange={(e) =>
                                                updateDisplayRange({
                                                    displayStart: e.detail['display-start'],
                                                    displayEnd: e.detail['display-end']
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </NightingaleManagerComponent>
            </div>
        </div>
    );
};

export default VirtualizedAlignment;
