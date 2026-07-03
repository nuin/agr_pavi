'use client';

import React, { useEffect, useId } from 'react';
import { getSpecies, getSingleGenomeLocation } from 'https://raw.githubusercontent.com/alliance-genome/agr_ui/main/src/lib/utils.js';
import { GeneInfo } from '../AlignmentEntry/types';
import { buildNcListUrl, buildIsoformTrackConfig, ViewerRegion } from './trackConfig';

export interface GenomeFeatureViewProps {
    readonly gene: GeneInfo;
    readonly release: string;
    readonly width?: number;
    readonly height?: number;
    // eslint-disable-next-line no-unused-vars
    readonly onError?: (message: string) => void;
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
                new GenomeFeatureViewer(config, `#${svgId}`, width, height);
            } catch (e) {
                if (!disposed) {
                    onError?.(e instanceof Error ? e.message : String(e));
                }
            }
        }

        renderViewer();
        return () => {
            disposed = true;
            clearSvg();
        };
    }, [gene, release, svgId, width, height, onError]);

    return <svg id={svgId} width={width} height={height} />;
}
