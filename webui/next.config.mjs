import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
    enabled: process.env.ANALYZE === 'true',
});

// Serve the app under a URL prefix (e.g. '/pavi') when NEXT_PUBLIC_BASE_PATH is set.
// Unset/empty (default) keeps the app at root, matching current behavior exactly.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        dirs: ['src', 'cypress/e2e', 'cypress/support'],
    },
    // Remove 'output: standalone' for Vercel deployment compatibility
    // Use 'standalone' only for Docker builds
    skipTrailingSlashRedirect: true,
    experimental: {
        urlImports: [
            'https://raw.githubusercontent.com/alliance-genome/agr_ui/main/',
            'https://raw.githubusercontent.com/alliance-genome/agr_ui/test/',
            'https://raw.githubusercontent.com/alliance-genome/agr_ui/stage/'
        ]
    },
    ...(basePath ? { basePath } : {}),
};

export default withBundleAnalyzer(nextConfig);
