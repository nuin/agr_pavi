import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { AlignmentEntry } from '../AlignmentEntry';

// Same virtual mock for the agr_ui raw-github util as the main AlignmentEntry
// test harness (see AlignmentEntry.test.tsx).
jest.mock(
    'https://raw.githubusercontent.com/alliance-genome/agr_ui/main/src/lib/utils.js',
    () => ({
        getSpecies: jest.fn((taxonId: string) => ({
            apolloName: 'human',
            apolloTrack: '/All%20Genes/',
            enableOrthologComparison: true,
            enableSingleCellExpressionAtlasLink: true,
            fullName: 'Homo sapiens',
            jBrowseName: 'Homo sapiens',
            jBrowseOrthologyTracks: '',
            jBrowsefastaurl: '',
            jBrowsenclistbaseurltemplate: '',
            jBrowsetracks: '',
            jBrowseurltemplate: '',
            shortName: 'Hsa',
            taxonId: taxonId,
            vertebrate: true,
        })),
        getSingleGenomeLocation: jest.fn((genomeLocations: any[]) => genomeLocations[genomeLocations.length - 1]),
    }),
    { virtual: true }
);

jest.mock('../../TranscriptViewer', () => ({
    TranscriptViewerDialog: () => null,
}));

jest.mock('generic-sequence-panel', () => ({
    fetchTranscripts: jest.fn(async () => []),
}));

// Reuse the real gene/allele mocks (fetchGeneInfo, fetchAlleles, ...) from the
// existing manual mock, but take control of the two new variant-search
// server actions so we can assert on how AlignmentEntry calls them.
// Jest requires out-of-scope variables referenced inside a jest.mock factory
// to be prefixed with "mock" (case-insensitive).
const mockLookupVariantByHgvs = jest.fn();
const mockSearchVariants = jest.fn();
jest.mock('../serverActions', () => ({
    ...jest.requireActual('../__mocks__/serverActions'),
    lookupVariantByHgvs: (...a: any[]) => mockLookupVariantByHgvs(...a),
    searchVariants: (...a: any[]) => mockSearchVariants(...a),
}));

describe('AlignmentEntry variant search', () => {
    beforeEach(() => {
        mockLookupVariantByHgvs.mockReset();
        mockSearchVariants.mockReset();
    });

    it('resolves a pasted HGVS via lookupVariantByHgvs and adds it as an option', async () => {
        mockLookupVariantByHgvs.mockResolvedValue({
            id: 'MGI:1856155',
            displayName: 'Pax6Sey',
            variants: new Map([
                ['NC_000068.8:g.105521966G>T', {
                    id: 'NC_000068.8:g.105521966G>T',
                    displayName: 'NC_000068.8:g.105521966G>T',
                    consequences: [],
                }],
            ]),
            hasDisease: false,
            hasPhenotype: false,
            source: 'lookup',
        });

        const result = render(
            <AlignmentEntry
                index={0}
                agrjBrowseDataRelease='0.0.0'
                dispatchInputPayloadPart={jest.fn()}
                initialGeneId="MOCK:GENE1"
            />
        );

        // Wait for the gene to resolve and the allele field to become enabled.
        await waitFor(() => {
            const alleleInputElement = result.container.querySelector('#alleles-0');
            expect(alleleInputElement).not.toHaveClass('p-disabled');
        }, { timeout: 5000 });

        // Open the allele selection panel.
        fireEvent.focus(result.container.querySelector('div#alleles-0')!);
        const allelesDropdownTrigger = result.container.querySelector('div#alleles-0 > div.p-multiselect-trigger');
        expect(allelesDropdownTrigger).not.toBeNull();
        fireEvent.click(allelesDropdownTrigger!);

        await waitFor(() => {
            expect(document.querySelector('div.p-multiselect-panel')).not.toBeNull();
        });

        // Type the HGVS into the MultiSelect's own filter input.
        const filterInput = document.querySelector('input.p-multiselect-filter') as HTMLInputElement | null;
        expect(filterInput).not.toBeNull();
        fireEvent.change(filterInput!, { target: { value: 'NC_000068.8:g.105521966G>T' } });

        // Let the ~350ms debounce elapse and the lookup resolve.
        await waitFor(() => {
            expect(mockLookupVariantByHgvs).toHaveBeenCalledWith('MOCK:GENE1', 'NC_000068.8:g.105521966G>T');
        }, { timeout: 3000 });

        // The found allele was merged into the options and is now visible.
        await waitFor(() => {
            expect(screen.getByText('Pax6Sey')).toBeInTheDocument();
        }, { timeout: 3000 });

        expect(mockSearchVariants).not.toHaveBeenCalled();
    });
});
