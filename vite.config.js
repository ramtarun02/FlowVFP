import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/VFP-2025',

    plugins: [react()],
    server: {
        port: 3000,
        open: true
    },
    build: {
        outDir: 'build',
        assetsDir: 'assets',
    },
    css: {
        postcss: './postcss.config.js'
    },
    esbuild: {
        loader: 'jsx',
        include: /src\/.*\.[jt]sx?$/,
        exclude: []
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                '.js': 'jsx'
            }
        }
    }
})
