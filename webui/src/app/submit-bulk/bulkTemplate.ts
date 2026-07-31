export const TEMPLATE_FILENAME = 'pavi-bulk-genes-template.csv';

// A ready-to-edit template: the canonical header plus two example rows
// showing an optional-transcript row and an optional-variants row.
export function buildTemplateCsv(): string {
    return [
        'species,gene_symbol,transcript,variants',
        'Homo sapiens,TP53,ENST00000269305.9,',
        'Mus musculus,Sod1,,MGI:6157439;MGI:6157441',
    ].join('\n');
}
