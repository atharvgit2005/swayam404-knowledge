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

  console.log('3/4: Building Content Script (self-contained IIFE)...');
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

  console.log('4/4: Building ChatGPT Content Script (self-contained IIFE)...');
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
        entry: path.resolve(root, 'src/content/chatgptContent.ts'),
        name: 'Swayam404ChatGptBridge',
        formats: ['iife'],
        fileName: () => 'chatgptContent.js',
      },
      rollupOptions: {
        output: {
          entryFileNames: 'chatgptContent.js',
          extend: true,
        },
      },
    },
  });

  // 5/5: Post-build audit: Chrome reserves names starting with '_' for system use
  const fs = await import('node:fs');
  function checkChromeReservedFilenames(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('_') && entry.name !== '_locales' && entry.name !== '_metadata') {
        throw new Error(
          `Chrome Extension Violation: "${entry.name}" starts with an underscore "_". Chromium rejects loading extensions with filenames starting with "_"!`
        );
      }
      if (entry.isDirectory()) {
        checkChromeReservedFilenames(path.join(dir, entry.name));
      }
    }
  }
  checkChromeReservedFilenames(path.resolve(root, 'dist'));
  console.log('🛡️  Verified Chrome filename compliance (zero forbidden "_" prefixes).');

  console.log('✅ Extension build complete! Packaged in dist/');
}

runBuild().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
