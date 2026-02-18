'use client';

import React, { useMemo, useState } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Tooltip } from 'primereact/tooltip';
import { parse } from 'clustal-js';
import { SeqInfoDict } from '../InteractiveAlignment/types';
import styles from './ResultsSummary.module.css';

export interface PairwiseIdentity {
    seq1: string;
    seq2: string;
    identity: number;
}

export interface ConservedBlock {
    start: number;
    end: number;
    length: number;
}

export interface AlignmentStats {
    sequenceCount: number;
    alignmentLength: number;
    conservationScore: number;
    gapPercentage: number;
    variantsCount: number;
    failuresCount: number;
    conservedPositions: number;
    pairwiseIdentities: PairwiseIdentity[];
    longestConservedBlock: ConservedBlock | null;
    speciesList: string[];
}

export interface ResultsSummaryProps {
    jobId: string;
    alignmentResult?: string;
    seqInfoDict?: SeqInfoDict;
    isLoading?: boolean;
    completedAt?: Date;
    processingTime?: number; // in seconds
    onDownload?: () => void;
    onShare?: () => void;
}

export function ResultsSummary({
    jobId,
    alignmentResult,
    seqInfoDict,
    isLoading = false,
    completedAt,
    processingTime,
    onDownload,
    onShare,
}: ResultsSummaryProps) {

    const stats: AlignmentStats = useMemo(() => {
        if (!alignmentResult) {
            return {
                sequenceCount: 0,
                alignmentLength: 0,
                conservationScore: 0,
                gapPercentage: 0,
                variantsCount: 0,
                failuresCount: 0,
                conservedPositions: 0,
                pairwiseIdentities: [],
                longestConservedBlock: null,
                speciesList: [],
            };
        }

        // Parse CLUSTAL alignment to get sequences
        let sequences: Array<{ name: string; seq: string }> = [];
        try {
            const parsedAlignment = parse(alignmentResult);
            sequences = parsedAlignment['alns'].map((aln: { id: string; seq: string }) => ({
                name: aln.id,
                seq: aln.seq
            }));
        } catch {
            // Fallback: try FASTA format
            const lines = alignmentResult.split('\n');
            let currentName = '';
            let currentSeq = '';
            for (const line of lines) {
                if (line.startsWith('>')) {
                    if (currentSeq) sequences.push({ name: currentName, seq: currentSeq });
                    currentName = line.slice(1).trim();
                    currentSeq = '';
                } else {
                    currentSeq += line.trim();
                }
            }
            if (currentSeq) sequences.push({ name: currentName, seq: currentSeq });
        }

        const sequenceCount = sequences.length;
        const alignmentLength = sequences.length > 0 ? sequences[0].seq.length : 0;

        // Calculate gap percentage
        let totalGaps = 0;
        let totalChars = 0;
        for (const { seq } of sequences) {
            for (const char of seq) {
                totalChars++;
                if (char === '-') {
                    totalGaps++;
                }
            }
        }
        const gapPercentage = totalChars > 0 ? (totalGaps / totalChars) * 100 : 0;

        // Calculate conservation and find conserved positions
        let conservedPositions = 0;
        const isConserved: boolean[] = [];
        if (alignmentLength > 0 && sequenceCount > 1) {
            for (let i = 0; i < alignmentLength; i++) {
                const residuesAtPosition = new Set<string>();
                let hasNonGap = false;
                for (const { seq } of sequences) {
                    if (i < seq.length && seq[i] !== '-') {
                        residuesAtPosition.add(seq[i].toUpperCase());
                        hasNonGap = true;
                    }
                }
                const posConserved = hasNonGap && residuesAtPosition.size === 1;
                isConserved.push(posConserved);
                if (posConserved) {
                    conservedPositions++;
                }
            }
        }
        const conservationScore = alignmentLength > 0
            ? (conservedPositions / alignmentLength) * 100
            : 0;

        // Find longest conserved block
        let longestConservedBlock: ConservedBlock | null = null;
        let currentBlockStart = -1;
        let currentBlockLength = 0;
        for (let i = 0; i <= isConserved.length; i++) {
            if (i < isConserved.length && isConserved[i]) {
                if (currentBlockStart === -1) {
                    currentBlockStart = i;
                }
                currentBlockLength++;
            } else {
                if (currentBlockLength > 0) {
                    if (!longestConservedBlock || currentBlockLength > longestConservedBlock.length) {
                        longestConservedBlock = {
                            start: currentBlockStart + 1, // 1-based
                            end: currentBlockStart + currentBlockLength,
                            length: currentBlockLength,
                        };
                    }
                }
                currentBlockStart = -1;
                currentBlockLength = 0;
            }
        }

        // Calculate pairwise identities
        const pairwiseIdentities: PairwiseIdentity[] = [];
        for (let i = 0; i < sequences.length; i++) {
            for (let j = i + 1; j < sequences.length; j++) {
                let matches = 0;
                let compared = 0;
                const seq1 = sequences[i].seq;
                const seq2 = sequences[j].seq;
                for (let k = 0; k < alignmentLength; k++) {
                    const c1 = seq1[k]?.toUpperCase();
                    const c2 = seq2[k]?.toUpperCase();
                    // Only compare non-gap positions
                    if (c1 && c2 && c1 !== '-' && c2 !== '-') {
                        compared++;
                        if (c1 === c2) {
                            matches++;
                        }
                    }
                }
                const identity = compared > 0 ? (matches / compared) * 100 : 0;
                // Get short names for display
                const name1 = sequences[i].name.split('_')[0] || sequences[i].name.slice(0, 10);
                const name2 = sequences[j].name.split('_')[0] || sequences[j].name.slice(0, 10);
                pairwiseIdentities.push({ seq1: name1, seq2: name2, identity });
            }
        }

        // Extract species list from seqInfoDict
        const speciesSet = new Set<string>();
        if (seqInfoDict) {
            for (const seqInfo of Object.values(seqInfoDict)) {
                if (seqInfo.species) {
                    speciesSet.add(seqInfo.species);
                }
            }
        }
        const speciesList = Array.from(speciesSet);

        // Count variants and failures from seqInfoDict
        let variantsCount = 0;
        let failuresCount = 0;

        if (seqInfoDict) {
            for (const seqInfo of Object.values(seqInfoDict)) {
                if (seqInfo.error) {
                    failuresCount++;
                }
                if (seqInfo.embedded_variants) {
                    variantsCount += seqInfo.embedded_variants.length;
                }
            }
        }

        return {
            sequenceCount,
            alignmentLength,
            conservationScore,
            gapPercentage,
            variantsCount,
            failuresCount,
            conservedPositions,
            pairwiseIdentities,
            longestConservedBlock,
            speciesList,
        };
    }, [alignmentResult, seqInfoDict]);

    const getOverallStatus = (): 'success' | 'warning' | 'error' => {
        if (stats.failuresCount > 0) {
            return stats.failuresCount > stats.sequenceCount / 2 ? 'error' : 'warning';
        }
        return 'success';
    };

    const getStatusIcon = (status: 'success' | 'warning' | 'error'): string => {
        switch (status) {
            case 'success': return 'pi pi-check-circle';
            case 'warning': return 'pi pi-exclamation-triangle';
            case 'error': return 'pi pi-times-circle';
        }
    };

    const getStatusLabel = (status: 'success' | 'warning' | 'error'): string => {
        switch (status) {
            case 'success': return 'Completed Successfully';
            case 'warning': return 'Completed with Warnings';
            case 'error': return 'Completed with Errors';
        }
    };

    const formatDuration = (seconds: number): string => {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const getQualityClass = (score: number): string => {
        if (score >= 80) return styles.excellent;
        if (score >= 60) return styles.good;
        if (score >= 40) return styles.moderate;
        return styles.poor;
    };

    const status = getOverallStatus();

    if (isLoading) {
        return (
            <div className={styles.container}>
                <Card className={styles.summaryCard}>
                    <div className={styles.loading}>
                        <i className="pi pi-spin pi-spinner" style={{ fontSize: '1.5rem' }} />
                        <span>Loading job results...</span>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <Tooltip target=".tooltip-target" />
            <Card className={`${styles.summaryCard} ${styles[status]}`}>
                {/* Header Section */}
                <div className={styles.header}>
                    <div className={styles.titleSection}>
                        <div className={`${styles.statusIcon} ${styles[status]}`}>
                            <i className={getStatusIcon(status)} />
                        </div>
                        <div className={styles.titleText}>
                            <h2>Alignment Results</h2>
                            <p>{getStatusLabel(status)}</p>
                        </div>
                    </div>
                    <div className={styles.actions}>
                        {onDownload && (
                            <Button
                                icon="pi pi-download"
                                label="Download"
                                className="p-button-outlined p-button-sm"
                                onClick={onDownload}
                            />
                        )}
                        {onShare && (
                            <Button
                                icon="pi pi-share-alt"
                                className="p-button-outlined p-button-sm p-button-secondary"
                                onClick={onShare}
                                tooltip="Share results"
                            />
                        )}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className={styles.statsGrid}>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Sequences</span>
                        <span className={styles.statValue}>
                            <i className="pi pi-list" />
                            {stats.sequenceCount}
                        </span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Alignment Length</span>
                        <span className={styles.statValue}>
                            <i className="pi pi-arrows-h" />
                            {stats.alignmentLength.toLocaleString()} aa
                        </span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Variants</span>
                        <span className={`${styles.statValue} ${stats.variantsCount > 0 ? styles.warning : ''}`}>
                            <i className="pi pi-bolt" />
                            {stats.variantsCount}
                        </span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Issues</span>
                        <span className={`${styles.statValue} ${stats.failuresCount > 0 ? styles.error : styles.success}`}>
                            <i className={stats.failuresCount > 0 ? 'pi pi-exclamation-circle' : 'pi pi-check'} />
                            {stats.failuresCount}
                        </span>
                    </div>
                </div>

                {/* Quality Indicators */}
                {stats.alignmentLength > 0 && (
                    <div className={styles.qualitySection}>
                        <div className={styles.qualityItem}>
                            <span className={styles.qualityLabel}>Conservation:</span>
                            <div className={styles.qualityBar}>
                                <div
                                    className={`${styles.qualityFill} ${getQualityClass(stats.conservationScore)}`}
                                    style={{ width: `${Math.min(100, stats.conservationScore)}%` }}
                                />
                            </div>
                            <span className={styles.qualityValue}>{stats.conservationScore.toFixed(1)}%</span>
                            <Tag
                                severity={stats.conservationScore >= 60 ? 'success' : 'warning'}
                                value={stats.conservationScore >= 80 ? 'High' : stats.conservationScore >= 60 ? 'Moderate' : 'Low'}
                                className="tooltip-target"
                                data-pr-tooltip="Percentage of fully conserved positions"
                            />
                        </div>
                        <div className={styles.qualityItem}>
                            <span className={styles.qualityLabel}>Gap Content:</span>
                            <div className={styles.qualityBar}>
                                <div
                                    className={`${styles.qualityFill} ${getQualityClass(100 - stats.gapPercentage)}`}
                                    style={{ width: `${Math.min(100, stats.gapPercentage)}%` }}
                                />
                            </div>
                            <span className={styles.qualityValue}>{stats.gapPercentage.toFixed(1)}%</span>
                            <Tag
                                severity={stats.gapPercentage < 20 ? 'success' : stats.gapPercentage < 40 ? 'warning' : 'danger'}
                                value={stats.gapPercentage < 20 ? 'Low' : stats.gapPercentage < 40 ? 'Moderate' : 'High'}
                                className="tooltip-target"
                                data-pr-tooltip="Percentage of gap characters in alignment"
                            />
                        </div>
                    </div>
                )}

                {/* Species List */}
                {stats.speciesList.length > 0 && (
                    <div className={styles.speciesSection}>
                        <span className={styles.sectionLabel}>Species:</span>
                        <div className={styles.speciesTags}>
                            {stats.speciesList.map((species) => (
                                <Tag key={species} value={species} severity="info" />
                            ))}
                        </div>
                    </div>
                )}

                {/* Conserved Positions & Longest Block */}
                {stats.alignmentLength > 0 && (
                    <div className={styles.conservationDetails}>
                        <div className={styles.conservationItem}>
                            <i className="pi pi-check-square" />
                            <span className={styles.conservationLabel}>Identical Positions:</span>
                            <span className={styles.conservationValue}>
                                {stats.conservedPositions} of {stats.alignmentLength}
                                <span className={styles.conservationPercent}>
                                    ({stats.conservationScore.toFixed(1)}%)
                                </span>
                            </span>
                        </div>
                        {stats.longestConservedBlock && (
                            <div className={styles.conservationItem}>
                                <i className="pi pi-arrows-h" />
                                <span className={styles.conservationLabel}>Longest Conserved Block:</span>
                                <span className={styles.conservationValue}>
                                    {stats.longestConservedBlock.length} aa
                                    <span className={styles.conservationPercent}>
                                        (positions {stats.longestConservedBlock.start}-{stats.longestConservedBlock.end})
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Pairwise Identity */}
                {stats.pairwiseIdentities.length > 0 && (
                    <div className={styles.pairwiseSection}>
                        <span className={styles.sectionLabel}>Pairwise Identity:</span>
                        <div className={styles.pairwiseGrid}>
                            {stats.pairwiseIdentities.map((pair, idx) => (
                                <div key={idx} className={styles.pairwiseItem}>
                                    <span className={styles.pairwiseNames}>
                                        {pair.seq1} vs {pair.seq2}
                                    </span>
                                    <span className={`${styles.pairwiseValue} ${
                                        pair.identity >= 70 ? styles.highIdentity :
                                        pair.identity >= 50 ? styles.medIdentity : styles.lowIdentity
                                    }`}>
                                        {pair.identity.toFixed(1)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Job Details */}
                <div className={styles.detailsSection}>
                    <div className={styles.detailItem}>
                        <i className="pi pi-tag" />
                        <span>Job ID:</span>
                        <code className={styles.jobId} title={jobId}>{jobId}</code>
                        <Button
                            icon="pi pi-copy"
                            className="p-button-text p-button-sm p-button-secondary"
                            onClick={() => {
                                navigator.clipboard.writeText(jobId);
                            }}
                            tooltip="Copy Job ID"
                            tooltipOptions={{ position: 'top' }}
                            style={{ marginLeft: '0.25rem', padding: '0.25rem' }}
                        />
                    </div>
                    {completedAt && (
                        <div className={styles.detailItem}>
                            <i className="pi pi-calendar" />
                            <span>Completed:</span>
                            <span>{completedAt.toLocaleString()}</span>
                        </div>
                    )}
                    {processingTime !== undefined && (
                        <div className={styles.detailItem}>
                            <i className="pi pi-clock" />
                            <span>Processing Time:</span>
                            <span>{formatDuration(processingTime)}</span>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

export default ResultsSummary;
