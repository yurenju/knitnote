import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import webExtension from 'vite-plugin-web-extension';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      manifest: () => manifest,
      additionalInputs: ['src/options/index.html']
    })
  ],
  build: { outDir: 'dist', emptyOutDir: true }
});
