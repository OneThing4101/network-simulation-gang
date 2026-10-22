import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const BACKEND = 'http://127.0.0.1:5080';

export default defineConfig({
  plugins: [tailwindcss()],
  esbuild: {jsx: 'automatic'},
  // The Flask backend only accepts mutating requests from its own origin, so the dev proxy
  // must present itself as :5080 (Host and Origin) or every POST comes back 403.
  server: {proxy: {'/api': {target: BACKEND, changeOrigin: true, headers: {Origin: BACKEND}}}},
});
