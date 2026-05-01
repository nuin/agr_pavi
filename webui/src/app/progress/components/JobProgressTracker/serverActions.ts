'use server';

import { JobStatusResponse } from './types';

import { validate as uuid_validate } from 'uuid'

export async function fetchJobStatusFull(jobId: string): Promise<JobStatusResponse | undefined> {
    if (!uuid_validate(jobId)) {
        console.error('Not a valid UUID.')
        return undefined
    }

    try {
        const response = await fetch(`${process.env.PAVI_API_BASE_URL}/api/pipeline-job/${jobId}`, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            },
            cache: 'no-store'  // Prevent caching for polling - always get fresh status
        })

        if (!response.ok) {
            console.error(`Failed to fetch job status: ${response.status}`)
            return undefined
        }

        const body = await response.json()
        console.log(`Job status for job ${jobId} received: ${JSON.stringify(body)}`)
        return body as JobStatusResponse

    } catch (e) {
        console.error('Error caught while requesting job status:', e)
        return undefined
    }
}
