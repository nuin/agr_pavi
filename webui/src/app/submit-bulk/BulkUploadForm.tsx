'use client';

import React, { useState } from 'react';
import { ExampleGene } from '@/app/submit/components/ExampleDataLoader/ExampleDataLoader';
import { JobSubmitForm } from '@/app/submit/components/JobSubmitForm/JobSubmitForm';
import { parseGeneListFile } from './parseGeneListFile';
import { resolveRows } from './resolveRows';
import { BulkUploadReport } from './BulkUploadReport';
import { buildTemplateCsv, TEMPLATE_FILENAME } from './bulkTemplate';
import { SkippedRow } from './types';

export interface BulkUploadFormProps {
    readonly agrjBrowseDataRelease: string;
}

type Status = 'idle' | 'processing' | 'ready' | 'error';

export function BulkUploadForm({ agrjBrowseDataRelease }: BulkUploadFormProps) {
    const [status, setStatus] = useState<Status>('idle');
    const [fileError, setFileError] = useState<string | null>(null);
    const [entries, setEntries] = useState<ExampleGene[]>([]);
    const [skipped, setSkipped] = useState<SkippedRow[]>([]);

    async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        setStatus('processing');
        setFileError(null);
        setEntries([]);
        setSkipped([]);

        const { rows, fileError: parseError } = await parseGeneListFile(file);
        if (parseError) {
            setFileError(parseError);
            setStatus('error');
            return;
        }

        const result = await resolveRows(rows);
        setEntries(result.entries);
        setSkipped(result.skipped);
        setStatus('ready');
    }

    function downloadTemplate() {
        const blob = new Blob([buildTemplateCsv()], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = TEMPLATE_FILENAME;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div>
            <div className="agr-card" style={{ marginBottom: '1rem' }}>
                <div className="agr-card-body">
                    <label htmlFor="bulk-file">Gene list file (CSV, TSV, or .xlsx)</label>
                    <input
                        id="bulk-file"
                        type="file"
                        accept=".csv,.tsv,.txt,.xlsx"
                        onChange={handleFile}
                    />
                    <button type="button" className="p-button-text" onClick={downloadTemplate}>
                        Download template
                    </button>
                    {status === 'processing' && <p>Resolving genes…</p>}
                    {fileError && <p role="alert">{fileError}</p>}
                </div>
            </div>

            {status === 'ready' && (
                <>
                    <BulkUploadReport loaded={entries.length} skipped={skipped} />
                    {entries.length > 0 && (
                        <JobSubmitForm
                            agrjBrowseDataRelease={agrjBrowseDataRelease}
                            initialGenes={entries}
                        />
                    )}
                </>
            )}
        </div>
    );
}
