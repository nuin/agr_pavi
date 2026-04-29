/* istanbul ignore file */

/**
 * Paginate an Alliance-style endpoint until either `maxDistinct` distinct keys
 * have been collected (via `keyExtractor`) or `maxRows` rows have been fetched.
 *
 * Useful when 1 logical entity (e.g. allele) emits many rows (e.g. 1 row per
 * transcript-consequence) and a row-based cap under-represents distinct entities.
 */
export async function fetchUntilDistinct({
    url,
    urlSearchParams = new URLSearchParams(),
    keyExtractor,
    maxDistinct,
    maxRows
}: {
    url: string,
    urlSearchParams?: URLSearchParams,
    // eslint-disable-next-line no-unused-vars
    keyExtractor: (row: any) => string | undefined,
    maxDistinct: number,
    maxRows: number
}): Promise<any[]> {
    const pageSize = Math.min(1000, maxRows);
    const fetchPage = async (page: number): Promise<{ returnedRecords: number, results: any[], total?: number }> => {
        const qp = new URLSearchParams(urlSearchParams)
        qp.append('page', page.toString())
        qp.append('limit', pageSize.toString())
        const response = await fetch(`${url}?${qp.toString()}`);
        if (!response.ok) {
            throw new Error(`Error fetching data: ${response.statusText}`);
        }
        return response.json();
    }

    // Page 1: serial, gives us total + early-exit window.
    const first = await fetchPage(1);
    const total = (first as any).total ?? first.returnedRecords;
    let rows: any[] = [...first.results];
    let distinct = new Set<string>();
    for (const r of first.results) {
        const k = keyExtractor(r); if (k !== undefined) distinct.add(k);
    }
    if (distinct.size >= maxDistinct || rows.length >= maxRows || first.returnedRecords < pageSize) {
        return rows.slice(0, maxRows);
    }

    // Compute remaining pages capped by maxRows budget.
    const remainingRows = Math.max(0, Math.min(maxRows, total) - rows.length);
    const remainingPages = Math.ceil(remainingRows / pageSize);
    if (remainingPages === 0) return rows;

    // Fire all remaining pages in parallel; small genes finish fast, large ones bounded.
    const pages = await Promise.all(
        Array.from({ length: remainingPages }, (_, i) => fetchPage(i + 2))
    );
    for (const p of pages) {
        for (const r of p.results) {
            rows.push(r);
            const k = keyExtractor(r); if (k !== undefined) distinct.add(k);
            if (rows.length >= maxRows) break;
        }
        if (rows.length >= maxRows) break;
    }
    return rows.slice(0, maxRows);
}

export async function fetchAllPages({
    url,
    urlSearchParams = new URLSearchParams(),
    maxResults
}: {
    url: string,
    urlSearchParams: URLSearchParams,
    maxResults?: number
}): Promise<any[]> {
    let results: any[] = [];
    let page = 1;
    const pageSize = Math.min(1000, maxResults || 1000);
    let hasMorePages = true;

    while (hasMorePages) {
        const queryParams = new URLSearchParams(urlSearchParams)
        console.log(`Fetching page ${page} of ${url} with query params: ${(queryParams.toString())}`);

        queryParams.append('page', page.toString())
        queryParams.append('limit', pageSize.toString())

        const response = await fetch(`${url}?${queryParams.toString()}`);
        if (!response.ok) {
            throw new Error(`Error fetching data: ${response.statusText}`);
        }

        type apiResponse = {
            returnedRecords: number
            results: any[]
        }
        const data: apiResponse = await response.json();
        results = results.concat(data.results);

        // Stop if we've reached maxResults
        if (maxResults && results.length >= maxResults) {
            results = results.slice(0, maxResults);
            hasMorePages = false;
        } else if (data.returnedRecords === pageSize) {
            page++;
        } else {
            hasMorePages = false;
        }
    }

    return Promise.resolve(results);
}
