import { parseGeneListFile } from '../parseGeneListFile';

// jsdom's File.text() is available; construct File objects from strings.
function csvFile(name: string, content: string): File {
    return new File([content], name, { type: 'text/plain' });
}

describe('parseGeneListFile', () => {
    it('parses a CSV with a header row and optional columns', async () => {
        const file = csvFile(
            'genes.csv',
            'species,gene_symbol,transcript,variants\n' +
                'Homo sapiens,TP53,ENST00000269305.9,\n' +
                'Mus musculus,Sod1,,MGI:6157439;MGI:6157441\n'
        );
        const { rows, fileError } = await parseGeneListFile(file);
        expect(fileError).toBeUndefined();
        expect(rows).toEqual([
            { species: 'Homo sapiens', symbol: 'TP53', transcript: 'ENST00000269305.9', variants: [], lineNumber: 2 },
            { species: 'Mus musculus', symbol: 'Sod1', transcript: undefined, variants: ['MGI:6157439', 'MGI:6157441'], lineNumber: 3 },
        ]);
    });

    it('parses TSV and is case-insensitive about header names', async () => {
        const file = csvFile(
            'genes.tsv',
            'Species\tGene_Symbol\n' + 'Rattus norvegicus\tSod1\n'
        );
        const { rows } = await parseGeneListFile(file);
        expect(rows).toEqual([
            { species: 'Rattus norvegicus', symbol: 'Sod1', transcript: undefined, variants: [], lineNumber: 2 },
        ]);
    });

    it('reports a file error when required columns are missing', async () => {
        const file = csvFile('bad.csv', 'foo,bar\n1,2\n');
        const { rows, fileError } = await parseGeneListFile(file);
        expect(rows).toEqual([]);
        expect(fileError).toMatch(/species/i);
    });

    it('reports a file error when there are no data rows', async () => {
        const file = csvFile('empty.csv', 'species,gene_symbol\n');
        const { fileError } = await parseGeneListFile(file);
        expect(fileError).toMatch(/no data rows/i);
    });
});
