import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        // ── Base path for GitHub Pages deployment ──────────────────────────────
        base: env.VITE_BASE_PATH || '/VFP-2025',

        plugins: [react()],

        // ── Path aliases (mirrors tsconfig.json paths) ─────────────────────────
        resolve: {
            alias: {
                '@':            resolve(__dirname, 'src'),
                '@api':         resolve(__dirname, 'src/api'),
                '@components':  resolve(__dirname, 'src/components'),
                '@hooks':       resolve(__dirname, 'src/hooks'),
                '@types':       resolve(__dirname, 'src/types'),
                '@utils':       resolve(__dirname, 'src/utils'),
                '@store':       resolve(__dirname, 'src/store'),
            },
        },

        // ── Dev server ────────────────────────────────────────────────────────
        server: {
            port: 3000,
            open: true,
            proxy: {
                // Proxy new blueprint API calls
                '/api': {
                    target:       env.VITE_API_URL || 'http://127.0.0.1:5000',
                    changeOrigin: true,
                },
                // Proxy legacy backend routes used by JS components
                '^/(import-geo|export-geo|fpcon|compute_tail_downwash|get_file_content|parse_vsp3|parse_vfp|interpolate_parameter|compute_desired|prowim-compute|boundary_layer_data|run-solver|upload-vfp)': {
                    target:       env.VITE_API_URL || 'http://127.0.0.1:5000',
                    changeOrigin: true,
                },
                '/socket.io': {
                    target:      env.VITE_WS_URL || 'http://127.0.0.1:5000',
                    changeOrigin: true,
                    ws: true,
                },
            },
        },

        // ── Build ─────────────────────────────────────────────────────────────
        build: {
            outDir:     'build',
            assetsDir:  'assets',
            sourcemap:  mode === 'development',
            // Split vendor bundles for better long-term caching
            rollupOptions: {
                output: {
                    manualChunks: {
                        react:   ['react', 'react-dom', 'react-router-dom'],
                        plotly:  ['plotly.js', 'react-plotly.js'],
                        charts:  ['chart.js', 'react-chartjs-2'],
                        three:   ['three'],
                        d3:      ['d3'],
                    },
                },
            },
        },

        // ── CSS ───────────────────────────────────────────────────────────────
        css: {
            postcss: './postcss.config.js',
        },

        // ── Test ──────────────────────────────────────────────────────────────
        test: {
            globals:     true,
            environment: 'jsdom',
            setupFiles:  './src/tests/setup.ts',
            coverage: {
                provider:  'v8',
                reporter:  ['text', 'json', 'html'],
                include:   ['src/**/*.{ts,tsx}'],
                exclude:   ['src/tests/**', 'src/main.tsx', 'src/**/*.d.ts'],
            },
        },
    };
});
