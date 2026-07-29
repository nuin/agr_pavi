import React from 'react';
import { render, waitFor } from '@testing-library/react';
import GenomeFeatureView, { stripDeadFullViewLinks } from '../GenomeFeatureView';

// Mock the cross-repo Alliance utils (same pattern as AlignmentEntry.test).
jest.mock(
    'https://raw.githubusercontent.com/alliance-genome/agr_ui/main/src/lib/utils.js',
    () => ({
        getSpecies: jest.fn(() => ({
            apolloName: 'human',
            jBrowsenclistbaseurltemplate:
                'https://s3.amazonaws.com/agrjbrowse/docker/{release}/human/',
        })),
        getSingleGenomeLocation: jest.fn(() => ({
            chromosome: '17',
            start: 100,
            end: 200,
        })),
    }),
    { virtual: true }
);

// Mock the genomefeatures library.
const viewerCtor = jest.fn();
const fetchNCListData = jest.fn(async () => [{ some: 'nclist' }]);
jest.mock(
    'genomefeatures',
    () => ({
        GenomeFeatureViewer: jest.fn((...args: unknown[]) => viewerCtor(...args)),
        fetchNCListData: (arg: unknown) => fetchNCListData(arg),
    }),
    { virtual: true }
);

const gene = {
    id: 'HGNC:11998',
    symbol: 'TP53',
    species: { taxonId: 'NCBITaxon:9606' },
    genomeLocations: [{ chromosome: '17', start: 100, end: 200 }],
} as any;

describe('GenomeFeatureView', () => {
    beforeEach(() => {
        viewerCtor.mockClear();
        fetchNCListData.mockClear();
    });

    it('renders an svg element', () => {
        const { container } = render(
            <GenomeFeatureView gene={gene} release="8.2.0" />
        );
        expect(container.querySelector('svg')).not.toBeNull();
    });

    it('fetches NCList data and instantiates the viewer with the built config', async () => {
        render(<GenomeFeatureView gene={gene} release="8.2.0" width={800} height={400} />);

        await waitFor(() => expect(viewerCtor).toHaveBeenCalledTimes(1));

        expect(fetchNCListData).toHaveBeenCalledWith({
            region: { chromosome: '17', start: 100, end: 200 },
            urlTemplate:
                'https://s3.amazonaws.com/agrjbrowse/docker/8.2.0/human/tracks/All_Genes/17/trackData.jsonz',
        });

        const [config, selector, width, height] = viewerCtor.mock.calls[0];
        expect(selector).toMatch(/^#gfv-/);
        expect(width).toBe(800);
        expect(height).toBe(400);
        expect(config.genome).toBe('human');
        expect(config.tracks[0].type).toBe('ISOFORM');
        expect(config.tracks[0].trackData).toEqual([{ some: 'nclist' }]);
    });

    it('calls onError when fetching fails', async () => {
        fetchNCListData.mockRejectedValueOnce(new Error('boom'));
        const onError = jest.fn();
        render(<GenomeFeatureView gene={gene} release="8.2.0" onError={onError} />);
        await waitFor(() => expect(onError).toHaveBeenCalledWith('boom'));
    });
});

describe('stripDeadFullViewLinks', () => {
    it('removes the dead JBrowse overflow notices but keeps transcript nodes', () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <svg>
                <g class="track">
                    <a class="transcriptLabel"><text>ENST0001</text></a>
                    <rect width="10" height="4"></rect>
                    <a class="transcriptLabel"><text><a href="https://alliancegenome.org/jbrowse/?data=x&loc=17:1..2">Maximum features displayed.  See full view for more.</a></text></a>
                </g>
            </svg>`;
        const svg = container.querySelector('svg') as SVGSVGElement;

        const removed = stripDeadFullViewLinks(svg);

        expect(removed).toBe(1);
        expect(svg.querySelector('a[href*="/jbrowse/"]')).toBeNull();
        expect(svg.textContent).not.toContain('Maximum features displayed');
        // Transcript model + label preserved.
        expect(svg.querySelector('rect')).not.toBeNull();
        expect(svg.textContent).toContain('ENST0001');
    });

    it('removes a bare dead anchor when it has no enclosing text element', () => {
        const container = document.createElement('div');
        container.innerHTML =
            `<svg><a href="https://alliancegenome.org/jbrowse/?loc=1:1..2">x</a><rect></rect></svg>`;
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(stripDeadFullViewLinks(svg)).toBe(1);
        expect(svg.querySelector('a')).toBeNull();
        expect(svg.querySelector('rect')).not.toBeNull();
    });

    it('is a no-op when there are no dead links', () => {
        const container = document.createElement('div');
        container.innerHTML =
            `<svg><g class="track"><rect></rect><text>ENST0001</text></g></svg>`;
        const svg = container.querySelector('svg') as SVGSVGElement;

        expect(stripDeadFullViewLinks(svg)).toBe(0);
        expect(svg.querySelector('rect')).not.toBeNull();
        expect(svg.textContent).toContain('ENST0001');
    });
});
