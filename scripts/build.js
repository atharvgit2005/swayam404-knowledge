import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

async function runBuild() {
  console.log('1/3: Building Extension UI (popup & sidepanel)...');
  await build({
    root,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(root, 'popup.html'),
          sidepanel: path.resolve(root, 'sidepanel.html'),
        },
      },
    },
  });

  console.log('2/3: Building Background Service Worker (ES module)...');
  await build({
    root,
    configFile: false,
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: path.resolve(root, 'src/background/index.ts'),
        formats: ['es'],
        fileName: () => 'background.js',
      },
      rollupOptions: {
        output: {
          entryFileNames: 'background.js',
        },
      },
    },
  });

  console.log('3/3: Building Content Script (self-contained IIFE)...');
  await build({
    root,
    configFile: false,
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: path.resolve(root, 'src/content/index.ts'),
        name: 'Swayam404ContentScript',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
      rollupOptions: {
        output: {
          entryFileNames: 'content.js',
          extend: true,
        },
      },
    },
  });

  console.log('✅ Extension build complete! Packaged in dist/');
}

runBuild().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
