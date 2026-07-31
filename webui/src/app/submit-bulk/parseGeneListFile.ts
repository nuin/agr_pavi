import * as XLSX from 'xlsx';
import { RawRow } from './types';

// Header aliases → canonical field. Matching is lowercase + trimmed.
const HEADER_MAP: Record<string, 'species' | 'symbol' | 'transcript' | 'variants'> = {
    'species': 'species',
    'gene_symbol': 'symbol',
    'gene symbol': 'symbol',
    'symbol': 'symbol',
    'gene': 'symbol',
    'transcript': 'transcript',
    'variants': 'variants',
    'variant': 'variants',
    'alleles': 'variants',
};

function normalizeHeader(h: string): 'species' | 'symbol' | 'transcript' | 'variants' | undefined {
    return HEADER_MAP[h.trim().toLowerCase()];
}

function splitVariants(cell: string | undefined): string[] {
    if (!cell) return [];
    return cell
        .split(/[;,]/)
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
}

// file.text() / file.arrayBuffer() aren't implemented on jsdom's File in the
// test environment, so read via FileReader instead — it works in both jsdom
// and real browsers.
function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

// Read the file into a 2-D array of string cells. CSV/TSV are sniffed by
// delimiter; .xlsx is read via SheetJS from the first sheet.
async function readGrid(file: File): Promise<string[][]> {
    const isXlsx = /\.xlsx$/i.test(file.name);
    if (isXlsx) {
        const buf = await readFileAsArrayBuffer(file);
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            blankrows: false,
            defval: '',
            raw: false,
        });
        return grid.map((row) => row.map((c) => String(c ?? '')));
    }
    const text = await readFileAsText(file);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const delimiter = (lines[0] ?? '').includes('\t') ? '\t' : ',';
    return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
}

export async function parseGeneListFile(
    file: File
): Promise<{ rows: RawRow[]; fileError?: string }> {
    let grid: string[][];
    try {
        grid = await readGrid(file);
    } catch (e) {
        return { rows: [], fileError: `Couldn't read the file: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (grid.length === 0) {
        return { rows: [], fileError: 'The file appears to be empty.' };
    }

    const headerCells = grid[0];
    const colIndex: Partial<Record<'species' | 'symbol' | 'transcript' | 'variants', number>> = {};
    headerCells.forEach((cell, i) => {
        const field = normalizeHeader(cell);
        if (field && colIndex[field] === undefined) colIndex[field] = i;
    });

    if (colIndex.species === undefined || colIndex.symbol === undefined) {
        return {
            rows: [],
            fileError:
                'The file needs a header row with at least "species" and "gene_symbol" columns.',
        };
    }

    const rows: RawRow[] = [];
    for (let i = 1; i < grid.length; i++) {
        const cells = grid[i];
        const get = (idx?: number) => (idx === undefined ? '' : (cells[idx] ?? '').trim());
        rows.push({
            species: get(colIndex.species),
            symbol: get(colIndex.symbol),
            transcript: get(colIndex.transcript) || undefined,
            variants: splitVariants(get(colIndex.variants)),
            lineNumber: i + 1,
        });
    }

    if (rows.length === 0) {
        return { rows: [], fileError: 'The file has a header but no data rows.' };
    }

    return { rows };
}
