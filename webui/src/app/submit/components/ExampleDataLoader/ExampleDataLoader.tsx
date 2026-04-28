'use client';

import React, { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import styles from './ExampleDataLoader.module.css';

export interface ExampleData {
    id: string;
    name: string;
    description: string;
    genes: ExampleGene[];
    category: 'basic' | 'advanced' | 'cross-species';
}

export interface ExampleGene {
    geneId: string;
    geneName: string;
    species: string;
    alleleIds?: string[];
}

// Pre-defined example datasets
export const EXAMPLE_DATASETS: ExampleData[] = [
    {
        id: 'tp53-orthologs',
        name: 'TP53 Orthologs',
        description: 'Compare the tumor suppressor protein p53 across human, mouse, and zebrafish',
        category: 'cross-species',
        genes: [
            { geneId: 'HGNC:11998', geneName: 'TP53', species: 'Homo sapiens' },
            { geneId: 'MGI:98834', geneName: 'Trp53', species: 'Mus musculus' },
            { geneId: 'ZFIN:ZDB-GENE-990415-270', geneName: 'tp53', species: 'Danio rerio' },
        ],
    },
    {
        id: 'brca1-comparison',
        name: 'BRCA1 Human-Mouse',
        description: 'Align BRCA1 DNA repair protein between human and mouse',
        category: 'basic',
        genes: [
            { geneId: 'HGNC:1100', geneName: 'BRCA1', species: 'Homo sapiens' },
            { geneId: 'MGI:104537', geneName: 'Brca1', species: 'Mus musculus' },
        ],
    },
    {
        id: 'pax6-evolution',
        name: 'PAX6 Eye Development',
        description: 'Highly conserved eye development transcription factor',
        category: 'advanced',
        genes: [
            { geneId: 'HGNC:8620', geneName: 'PAX6', species: 'Homo sapiens' },
            { geneId: 'MGI:97490', geneName: 'Pax6', species: 'Mus musculus' },
            { geneId: 'FB:FBgn0004170', geneName: 'ey', species: 'Drosophila melanogaster' },
            { geneId: 'WB:WBGene00003927', geneName: 'pax-6', species: 'Caenorhabditis elegans' },
        ],
    },
    {
        id: 'actin-conserved',
        name: 'Actin (Highly Conserved)',
        description: 'Beta-actin cytoskeletal protein - one of the most conserved proteins',
        category: 'advanced',
        genes: [
            { geneId: 'HGNC:132', geneName: 'ACTB', species: 'Homo sapiens' },
            { geneId: 'MGI:87904', geneName: 'Actb', species: 'Mus musculus' },
            { geneId: 'ZFIN:ZDB-GENE-000329-3', geneName: 'actb1', species: 'Danio rerio' },
        ],
    },
    {
        id: 'worm-fly-hsp70',
        name: 'Worm-Fly Heat Shock',
        description: 'HSP70 chaperone - highly conserved stress response protein',
        category: 'cross-species',
        genes: [
            { geneId: 'WB:WBGene00002007', geneName: 'hsp-1', species: 'Caenorhabditis elegans' },
            { geneId: 'FB:FBgn0013278', geneName: 'Hsc70-4', species: 'Drosophila melanogaster' },
        ],
    },
    {
        id: 'mouse-rat-sod1',
        name: 'Mouse-Rat SOD1',
        description: 'Superoxide dismutase - ALS disease model comparison',
        category: 'basic',
        genes: [
            { geneId: 'MGI:98351', geneName: 'Sod1', species: 'Mus musculus' },
            { geneId: 'RGD:3727', geneName: 'Sod1', species: 'Rattus norvegicus' },
        ],
    },
    {
        id: 'zebrafish-human-myh',
        name: 'Zebrafish-Human Myosin',
        description: 'Cardiac myosin heavy chain - heart development model',
        category: 'cross-species',
        genes: [
            { geneId: 'ZFIN:ZDB-GENE-991019-3', geneName: 'myh6', species: 'Danio rerio' },
            { geneId: 'HGNC:7576', geneName: 'MYH6', species: 'Homo sapiens' },
        ],
    },
    {
        id: 'trp53-cancer-variants',
        name: 'Trp53 Cancer Variants',
        description: 'Mouse Trp53 with 4 cancer-associated missense alleles (R270H, P275S, N236S, R334H) plus one 3\' UTR variant (demonstrates non-coding filter), compared to human and zebrafish orthologs',
        category: 'advanced',
        genes: [
            {
                geneId: 'MGI:98834', geneName: 'Trp53', species: 'Mus musculus',
                alleleIds: [
                    'MGI:6393635',   // Trp53<em1Yoli> - 3' UTR polyA (mimics human rs78378222) - non-coding demo
                    'MGI:3039266',   // Trp53<tm3.1Tyj> - p.R270H - Li-Fraumeni hotspot (Tyler Jacks)
                    'MGI:5431904',   // Trp53<tm1.1Rfo> - p.P275S - UVB hotspot (human codon 278)
                    'MGI:6763106',   // Trp53<tm1.1Itl> - p.N236S - human tumor mutation
                    'MGI:6718305',   // Trp53<tm1.1Gpz> - p.R334H - tumor susceptibility
                ],
            },
            { geneId: 'HGNC:11998', geneName: 'TP53', species: 'Homo sapiens' },
            { geneId: 'ZFIN:ZDB-GENE-990415-270', geneName: 'tp53', species: 'Danio rerio' },
        ],
    },
    {
        id: 'sod1-als-variants',
        name: 'SOD1 ALS Disease Variants',
        description: 'Mouse Sod1 with ALS-associated alleles compared to rat ortholog — classic neurodegeneration model',
        category: 'advanced',
        genes: [
            {
                geneId: 'MGI:98351', geneName: 'Sod1', species: 'Mus musculus',
                alleleIds: [
                    'MGI:6157439',   // Sod1<em1Rhbr> - g.90017759C>T
                    'MGI:6157441',   // Sod1<em2Rhbr> - g.90021288C>T
                    'MGI:6157446',   // Sod1<em3Rhbr> - g.90022049G>C
                    'MGI:6157448',   // Sod1<em4Rhbr> - g.90022074G>C
                    'MGI:5575771',   // Sod1<m1H> - g.90022044A>G
                ],
            },
            { geneId: 'RGD:3727', geneName: 'Sod1', species: 'Rattus norvegicus' },
        ],
    },
];

interface ExampleDataLoaderProps {
    // eslint-disable-next-line no-unused-vars
    onLoadExample: (example: ExampleData) => void;
    buttonLabel?: string;
    buttonIcon?: string;
    buttonClassName?: string;
}

export const ExampleDataLoader: React.FC<ExampleDataLoaderProps> = ({
    onLoadExample,
    buttonLabel = 'Load Example',
    buttonIcon = 'pi pi-database',
    buttonClassName = '',
}) => {
    const [dialogVisible, setDialogVisible] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const categories = [
        { id: 'basic', label: 'Basic', description: 'Simple two-species comparisons' },
        { id: 'cross-species', label: 'Cross-Species', description: 'Multi-organism alignments' },
        { id: 'advanced', label: 'Advanced', description: 'Complex evolutionary analyses' },
    ];

    const filteredExamples = selectedCategory
        ? EXAMPLE_DATASETS.filter((ex) => ex.category === selectedCategory)
        : EXAMPLE_DATASETS;

    const handleSelectExample = (example: ExampleData) => {
        onLoadExample(example);
        setDialogVisible(false);
        setSelectedCategory(null);
    };

    const dialogHeader = (
        <div className={styles.dialogHeader}>
            <span>Choose an Example Dataset</span>
        </div>
    );

    return (
        <>
            <Button
                label={buttonLabel}
                icon={buttonIcon}
                className={`p-button-outlined ${buttonClassName}`}
                onClick={() => setDialogVisible(true)}
                aria-label="Open example dataset selector"
            />

            <Dialog
                visible={dialogVisible}
                onHide={() => {
                    setDialogVisible(false);
                    setSelectedCategory(null);
                }}
                header={dialogHeader}
                className={styles.dialog}
                modal
                dismissableMask
                style={{ width: '600px', maxWidth: '90vw' }}
            >
                <div className={styles.dialogContent}>
                    <p className={styles.intro}>
                        Select an example to quickly see how PAVI works. These examples
                        use real gene data from the Alliance database.
                    </p>

                    <div className={styles.categoryFilter}>
                        <span className={styles.filterLabel}>Filter by type:</span>
                        <div className={styles.categoryButtons}>
                            <button
                                type="button"
                                className={`${styles.categoryBtn} ${!selectedCategory ? styles.active : ''}`}
                                onClick={() => setSelectedCategory(null)}
                            >
                                All
                            </button>
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    className={`${styles.categoryBtn} ${selectedCategory === cat.id ? styles.active : ''}`}
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.exampleGrid}>
                        {filteredExamples.map((example) => (
                            <button
                                key={example.id}
                                type="button"
                                className={styles.exampleCard}
                                onClick={() => handleSelectExample(example)}
                            >
                                <div className={styles.exampleHeader}>
                                    <h4 className={styles.exampleName}>{example.name}</h4>
                                    <span className={`${styles.categoryBadge} ${styles[example.category]}`}>
                                        {example.category.replace('-', ' ')}
                                    </span>
                                </div>
                                <p className={styles.exampleDescription}>{example.description}</p>
                                <div className={styles.geneList}>
                                    {example.genes.map((gene) => (
                                        <span key={gene.geneId} className={styles.geneBadge}>
                                            {gene.geneName}
                                            <span className={styles.species}>
                                                ({gene.species.split(' ')[0][0]}. {gene.species.split(' ')[1]})
                                            </span>
                                            {gene.alleleIds && gene.alleleIds.length > 0 && (
                                                <span className={styles.alleleBadge} title={`${gene.alleleIds.length} allele(s)`}>
                                                    +{gene.alleleIds.length}
                                                </span>
                                            )}
                                        </span>
                                    ))}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </Dialog>
        </>
    );
};
