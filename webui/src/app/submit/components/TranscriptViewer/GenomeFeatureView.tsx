'use client';

import React, { useEffect, useId } from 'react';
import { getSpecies, getSingleGenomeLocation } from 'https://raw.githubusercontent.com/alliance-genome/agr_ui/main/src/lib/utils.js';
import { GeneInfo } from '../AlignmentEntry/types';
import { buildNcListUrl, buildIsoformTrackConfig, ViewerRegion } from './trackConfig';
import './transcriptView.css';

export interface GenomeFeatureViewProps {
    readonly gene: GeneInfo;
    readonly release: string;
    readonly width?: number;
    readonly height?: number;
    // eslint-disable-next-line no-unused-vars
    readonly onError?: (message: string) => void;
}

/**
 * Remove the genomefeatures library's dead "full view" overflow notices.
 *
 * When a gene's locus has more features than the viewer's display cap, the
 * library appends a "Maximum features displayed. See full view for more."
 * link pointing at Alliance's decommissioned JBrowse 1
 * (https://alliancegenome.org/jbrowse/, which now 403s). We strip those dead
 * notices after render; the transcript models themselves are untouched. The
 * notice text lives inside an enclosing <text> element, so we remove that
 * where present (falling back to the anchor itself).
 *
 * Returns the number of dead links removed (useful for tests/assertions).
 */
export function stripDeadFullViewLinks(svgEl: Element): number {
    const deadLinks = svgEl.querySelectorAll('a[href*="/jbrowse/"]');
    deadLinks.forEach((anchor) => {
        const notice = anchor.closest('text');
        (notice ?? anchor).remove();
    });
    return deadLinks.length;
}

export default function GenomeFeatureView({
    gene,
    release,
    width = 900,
    height = 500,
    onError,
}: GenomeFeatureViewProps) {
    // useId can contain ':' which is invalid in a CSS selector; sanitise it.
    const rawId = useId().replace(/:/g, '_');
    const svgId = `gfv-${rawId}`;

    useEffect(() => {
        let disposed = false;
        let overflowObserver: MutationObserver | undefined;

        const clearSvg = () => {
            const el = document.getElementById(svgId);
            if (el) el.innerHTML = '';
        };

        async function renderViewer() {
            try {
                const speciesConfig = getSpecies(gene.species.taxonId);
                const location = getSingleGenomeLocation(gene.genomeLocations);
                const region: ViewerRegion = {
                    chromosome: location['chromosome'],
                    start: location['start'],
                    end: location['end'],
                };
                const urlTemplate = buildNcListUrl(
                    speciesConfig.jBrowsenclistbaseurltemplate,
                    release,
                    region.chromosome
                );

                const { GenomeFeatureViewer, fetchNCListData } = await import('genomefeatures');
                if (disposed) return;
                const trackData = await fetchNCListData({ region, urlTemplate });
                if (disposed) return;

                const config = buildIsoformTrackConfig({
                    region,
                    apolloName: speciesConfig.apolloName,
                    geneSymbol: gene.symbol,
                    geneId: gene.id,
                    speciesTaxonId: gene.species.taxonId,
                    trackData,
                });

                clearSvg();
                // `config.tracks[].trackData` is the NCList payload from
                // fetchNCListData, typed as unknown on our side; cast to the
                // library's ViewerConfig at this boundary.
                new GenomeFeatureViewer(
                    config as unknown as ConstructorParameters<typeof GenomeFeatureViewer>[0],
                    `#${svgId}`,
                    width,
                    height
                );

                // Strip the library's dead JBrowse-1 "full view" links. The
                // viewer may finish drawing asynchronously, so prune once now
                // and keep pruning as nodes arrive until cleanup.
                const svgEl = document.getElementById(svgId);
                if (svgEl) {
                    stripDeadFullViewLinks(svgEl);
                    overflowObserver = new MutationObserver(() =>
                        stripDeadFullViewLinks(svgEl)
                    );
                    overflowObserver.observe(svgEl, { childList: true, subtree: true });
                }
            } catch (e) {
                if (!disposed) {
                    onError?.(e instanceof Error ? e.message : String(e));
                }
            }
        }

        renderViewer();
        return () => {
            disposed = true;
            overflowObserver?.disconnect();
            clearSvg();
        };
    }, [gene, release, svgId, width, height, onError]);

    return <svg id={svgId} className="pavi-transcript-view" width={width} height={height} />;
}
