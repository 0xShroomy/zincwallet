import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import path from 'path';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  plugins: [
    react({
      // Only apply React to popup, not background or content scripts
      include: /src\/popup\//,
      exclude: [/src\/content\//, /src\/background\//],
    }),
    webExtension({
      manifest: './manifest.json',
      additionalInputs: ['src/popup/index.html'],
      disableAutoLaunch: true,
      skipManifestValidation: true,
      scriptViteConfig: {
        plugins: [],  // NO PLUGINS for content/background scripts
        build: {
          cssCodeSplit: false,
          minify: true,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
              assetFileNames: () => 'ignored-[name][extname]',
            },
            external: ['react', 'react-dom', 'react/jsx-runtime'],
          },
        },
      },
    }),
  ],
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/popup': path.resolve(__dirname, './src/popup'),
      '@/background': path.resolve(__dirname, './src/background'),
      '@/types': path.resolve(__dirname, './src/types'),
    },
  },
  build: {
    outDir: 'dist',
    copyPublicDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
