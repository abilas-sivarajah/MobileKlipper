import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * The release workflow sets MOBILEKLIPPER_VERSION from the tag it publishes;
 * local builds fall back to package.json.
 */
const version = (process.env.MOBILEKLIPPER_VERSION || pkg.version).replace(/^v/, '');

/**
 * Moonraker's update manager validates a web client by the release_info.json
 * in its install folder and compares "version" with the GitHub release tag.
 */
function releaseInfo(): Plugin {
  return {
    name: 'mobileklipper-release-info',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'release_info.json',
        source: `${JSON.stringify(
          { project_name: 'MobileKlipper', project_owner: 'abilas-sivarajah', version: `v${version}` },
          null,
          2,
        )}\n`,
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    releaseInfo(),
    VitePWA({
      // The app decides when to swap in a new version (after a Moonraker
      // update, or when the user taps "Neu laden"), never mid-task.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MobileKlipper',
        short_name: 'MobileKlipper',
        description: 'Control and monitor your Klipper 3D printers',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Printer traffic must never be served from cache.
        navigateFallbackDenylist: [/^\/(websocket|server|printer|machine|access|api)/],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
