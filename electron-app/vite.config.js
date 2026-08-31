import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' so the built index.html uses relative asset paths — Electron
// loads it via loadFile() (file://), not a web server.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
