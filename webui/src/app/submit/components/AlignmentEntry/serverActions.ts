'use server';

import { GeneInfo, AlleleInfo, GeneSuggestion, GeneAutocompleteApiResponse, VariantConsequence } from "./types";
import { fetchUntilDistinct } from "@/app/helper_fns";

// Adapt the new Alliance gene-summary response shape (everything nested
// under `.gene`, taxon/species split) to the flat GeneInfo shape that
// the rest of the WebUI was written against. Keeps downstream
// consumers (useTranscriptSelection, getSingleGenomeLocation, gene
// display names) working without a wider refactor.
//
// New shape -> old fields:
//   gene.primaryExternalId                                    -> id
//   gene.geneSymbol.displayText                               -> symbol
//   gene.taxon.species  (+ taxon.curie as taxonId)            -> species
//   gene.taxon.species.abbreviation                           -> species.shortName
//   gene.geneGenomicLocationAssociations[].{start,end,strand,
//     geneGenomicLocationAssociationObject.name}              -> genomeLocations[]
//                                                                with .chromosome from .name
function adaptGeneResponse(body: any): GeneInfo | undefined {
    if (!body) return undefined;
    // Backwards compatibility: if the API ever returns the old flat
    // shape again, pass it through unchanged.
    if (body.id && body.symbol && body.species) {
        return body as GeneInfo;
    }
    const g = body.gene;
    if (!g) return undefined;

    const taxonSpecies = g.taxon?.species ?? {};
    const species = {
        ...taxonSpecies,
        // Compatibility shims so older callers that read .shortName or
        // .taxonId off `species` continue to work.
        shortName: taxonSpecies.abbreviation,
        taxonId: g.taxon?.curie,
        name: g.taxon?.name,
    };

    const genomeLocations = (g.geneGenomicLocationAssociations ?? []).map((loc: any) => ({
        start: loc.start,
        end: loc.end,
        strand: loc.strand,
        chromosome: loc.geneGenomicLocationAssociationObject?.name,
        assembly: loc.geneGenomicLocationAssociationObject?.taxon?.species?.assembly_curie,
        ...loc,
    }));

    return {
        id: g.primaryExternalId,
        symbol: g.geneSymbol?.displayText ?? g.primaryExternalId,
        species,
        genomeLocations,
    };
}

export async function fetchGeneInfo (geneId: string): Promise<GeneInfo|undefined> {

    console.log(`New gene info request received.`)

    const jobResponse = fetch(`https://www.alliancegenome.org/api/gene/${geneId}`, {
        method: 'GET',
        headers: {
            'accept': 'application/json'
        }
    })
    .then((response: Response) => {
        if ( 500 <= response.status && response.status <= 599 ){
            // No point in attempting to process the body, as no body is expected.
            throw new Error('Server error received.', {cause: 'server error'})
        }

        return Promise.all([Promise.resolve(response), response.json()]);
    })
    .then(([response, body]) => {
        if (response.ok) {
            console.log(`Gene info for gene ${geneId} received successfully.`)
            return adaptGeneResponse(body);
        } else {
            const errMsg = 'Failure response received from gene API.'
            console.error(errMsg)
            if( 400 <= response.status && response.status <= 499 ){
                throw new Error(errMsg, {cause: 'user error'})
            }
            else{
                console.log('Non user-error response received:', response)
                throw new Error(errMsg, {cause: 'unkown'})
            }

        }
    })
    .catch((e: Error) => {
        console.error('Error caught while requesting gene info:', e)
        return undefined;
    });

    return jobResponse
}

export async function fetchGeneSuggestionsAutocomplete (query: string): Promise<GeneSuggestion[]> {

    console.log(`New gene suggestion search request received.`)

    const endpointUrl = `https://www.alliancegenome.org/api/search_autocomplete/`
    const jobResponse = fetch(`${endpointUrl}?category=gene&q=${query}`, {
        method: 'GET',
        headers: {
            'accept': 'application/json'
        }
    })
    .then((response: Response) => {
        if ( 500 <= response.status && response.status <= 599 ){
            // No point in attempting to process the body, as no body is expected.
            throw new Error('Server error received.', {cause: 'server error'})
        }

        return Promise.all([Promise.resolve(response), response.json()]);
    })
    .then(([response, body]) => {
        if (response.ok) {
            console.log(`Gene suggestions for query '${query}' received successfully: ${JSON.stringify(body)}`)
            return body['results'] as GeneAutocompleteApiResponse[];
        } else {
            const errMsg = 'Failure response received from gene autocomplete API.'
            console.error(errMsg)
            if( 400 <= response.status && response.status <= 499 ){
                throw new Error(errMsg, {cause: 'user error'})
            }
            else{
                console.log('Non user-error response received:', response)
                throw new Error(errMsg, {cause: 'unkown'})
            }

        }
    })
    .catch((e: Error) => {
        console.error('Error caught while requesting gene autocomplete:', e)
        throw e;
    });

    const suggestions: GeneSuggestion[] = (await jobResponse)?.map(autocompleteResponse => {
        return {
            id: autocompleteResponse.primaryKey,
            displayName: autocompleteResponse.name_key
        }
    })

    return suggestions
}

export async function fetchAlleles (geneId: string): Promise<AlleleInfo[]> {
    console.log(`Fetching alleles for gene: ${geneId}`)

    const endpointUrl = `https://www.alliancegenome.org/api/gene/${geneId}/allele-variant-detail`

    try {
        // Retrieve all alleleCategory filter values
        const categoriesResponse = await fetch(`${endpointUrl}?filter.alleleCategory=findCategories`, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            },
        });

        if (!categoriesResponse.ok) {
            console.warn(`Allele API returned ${categoriesResponse.status} for gene ${geneId}`)
            return [];
        }

        const categoriesBody = await categoriesResponse.json();

        // Check if we got valid data
        if (!categoriesBody['supplementalData']?.['distinctFieldValues']?.['filter.alleleCategory']) {
            console.warn(`No allele categories found for gene ${geneId}`)
            return [];
        }

        const alleleCategories = Array.from(categoriesBody['supplementalData']['distinctFieldValues']['filter.alleleCategory']);
        console.log(`Allele category query filters received: ${JSON.stringify(alleleCategories)}`)

        // Remove the "allele" option from alleleCategories (we want alleles WITH variants)
        const searchAlleleCategories = alleleCategories.filter(category => category !== 'allele')

        if (searchAlleleCategories.length === 0) {
            console.log(`No alleles with variants found for gene ${geneId}`)
            return [];
        }

        const queryParams = new URLSearchParams()
        queryParams.append('filter.alleleCategory', searchAlleleCategories.join('|'))

        // Alliance returns 1 row per (allele, variant, consequence) triple.
        // Page until we hit MAX_DISTINCT_ALLELES distinct allele.id, with a
        // hard row ceiling to bound payload on extreme cases (e.g. TP53 with
        // 100k+ rows for thousands of distinct alleles).
        const MAX_DISTINCT_ALLELES = 100;
        const MAX_ROWS = 3000;
        console.log(`Fetching allele info for gene ${geneId} (max ${MAX_DISTINCT_ALLELES} distinct alleles, ${MAX_ROWS} rows)`)

        // Adapter for the new Alliance allele-variant-detail response shape.
        // Field map vs the prior shape:
        //   result.allele.id                          -> result.allele.curie
        //   result.allele.symbol                      -> result.symbol            (top-level on the row)
        //   result.allele.hasDisease / hasPhenotype   -> result.hasDisease / hasPhenotype (top-level)
        //   result.variant.id                         -> no direct id; we use allele.curie as the variant key,
        //                                                since each row is one allele/variant pair for filter.alleleCategory=variant
        //   result.variant.displayName                -> result.symbol  or  variant.curatedVariantGenomicLocations[0].hgvs
        //   result.consequence.transcript.id          -> result.consequence.variantTranscript.curie
        //   result.consequence.transcript.name        -> result.consequence.variantTranscript.name
        //   result.consequence.molecularConsequences  -> result.consequence.vepConsequences
        //   result.consequence.impact                 -> result.consequence.vepImpact
        //   result.consequence.siftPrediction         -> removed at this level (use top-level supplementalData filter values)
        //   result.consequence.polyphenPrediction     -> removed at this level
        //   result.consequence.proteinStartPosition   -> removed at this level

        // Named alleles (filter.alleleCategory='allele with one variant')
        // use `primaryExternalId` (e.g. MGI:6157439); variant rows
        // (filter.alleleCategory='variant') use `curie` (e.g. rs146579778).
        // Check both so the example dataset's MGI:* allele IDs can be
        // matched and pre-selected after example load.
        const extractAlleleKey = (row: any): string | undefined =>
            row?.allele?.id
            ?? row?.allele?.primaryExternalId
            ?? row?.allele?.curie

        const results = await fetchUntilDistinct({
            url: endpointUrl,
            urlSearchParams: queryParams,
            keyExtractor: extractAlleleKey,
            maxDistinct: MAX_DISTINCT_ALLELES,
            maxRows: MAX_ROWS,
        });
        console.log(`Allele info for gene ${geneId} received successfully.`)

        const allelesMap = new Map<string, AlleleInfo>()

        const stripHtml = (s?: string) => (s ?? '').replace(/<[^>]+>/g, '')

        const parseConsequence = (raw: any): VariantConsequence | undefined => {
            if (!raw) return undefined
            // Old shape had `raw.transcript.{id,name}`; new shape has `raw.variantTranscript.{curie,name}`.
            const tx = raw['variantTranscript'] ?? raw['transcript']
            const txId = tx?.['curie'] ?? tx?.['id']
            const txName = tx?.['name']
            const consequences = Array.isArray(raw['vepConsequences'])
                ? raw['vepConsequences']
                : (Array.isArray(raw['molecularConsequences']) ? raw['molecularConsequences'] : [])
            const impact = raw['vepImpact'] ?? raw['impact']
            const proteinPosRaw = raw['proteinStartPosition']
            const proteinPos = proteinPosRaw !== undefined && proteinPosRaw !== null
                ? Number(proteinPosRaw)
                : undefined
            return {
                transcriptId: txId,
                transcriptName: txName,
                molecularConsequences: consequences,
                impact,
                proteinStartPosition: Number.isFinite(proteinPos) ? proteinPos as number : undefined,
                sift: raw['siftPrediction'],
                polyphen: raw['polyphenPrediction'],
            }
        }

        const extractVariantDisplayName = (result: any): string =>
            result['variant']?.['displayName']
            ?? result['symbol']
            ?? result['variant']?.['curatedVariantGenomicLocations']?.[0]?.['hgvs']
            ?? extractAlleleKey(result)
            ?? 'variant'

        results.forEach((result: any) => {
            if (result['variant'] === undefined) {
                console.error('Error: allele with undefined variant:', result)
                return;
            }
            const alleleId = extractAlleleKey(result)
            if (!alleleId) {
                console.warn('Allele row without identifier, skipping:', result)
                return
            }
            // Variant no longer carries its own id field in the new shape.
            // Fall back to the allele id so the inner variant map still
            // deduplicates correctly per (allele, variant) row.
            const variantId = result['variant']?.['id']
                ?? result['variant']?.['curie']
                ?? alleleId
            const consequence = parseConsequence(result['consequence'])

            // Named alleles carry their symbol under allele.alleleSymbol.{formatText,displayText}.
            // Variant rows put the genomic-location symbol at the top-level result.symbol.
            // Fall back through both shapes plus the legacy allele.symbol path.
            const alleleSymbol = result['allele']?.['symbol']
                ?? result['allele']?.['alleleSymbol']?.['displayText']
                ?? result['allele']?.['alleleSymbol']?.['formatText']
                ?? result['symbol']

            let allele = allelesMap.get(alleleId)
            if (allele === undefined) {
                allele = {
                    id: alleleId,
                    displayName: stripHtml(alleleSymbol) || alleleId,
                    variants: new Map(),
                    hasDisease: Boolean(result['allele']?.['hasDisease'] ?? result['hasDisease']),
                    hasPhenotype: Boolean(result['allele']?.['hasPhenotype'] ?? result['hasPhenotype']),
                }
                allelesMap.set(alleleId, allele)
            }

            let variant = allele.variants.get(variantId)
            if (variant === undefined) {
                variant = {
                    id: variantId,
                    displayName: extractVariantDisplayName(result),
                    consequences: [],
                }
                allele.variants.set(variantId, variant)
            }
            if (consequence) {
                variant.consequences.push(consequence)
            }
        })

        return Array.from(allelesMap.values());
    } catch (error) {
        console.error(`Error fetching alleles for gene ${geneId}:`, error)
        return [];
    }
}
