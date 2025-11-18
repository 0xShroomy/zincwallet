import { createWriteStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { createGzip } from 'zlib';
import archiver from 'archiver';

const distPath = 'dist';
const outputPath = '.';

async function createZip(name) {
  const output = createWriteStream(join(outputPath, `${name}.zip`));
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`✓ ${name}.zip created (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(distPath, false);
    archive.finalize();
  });
}

async function packageExtension() {
  console.log('📦 Packaging extension...\n');

  try {
    // Create Chrome package
    await createZip('zinc-wallet-chrome');

    // Create Firefox package
    await createZip('zinc-wallet-firefox');

    console.log('\n✨ Extension packaged successfully!');
    console.log('\nFiles created:');
    console.log('  - zinc-wallet-chrome.zip (for Chrome Web Store)');
    console.log('  - zinc-wallet-firefox.zip (for Firefox Add-ons)');
  } catch (error) {
    console.error('❌ Packaging failed:', error);
    process.exit(1);
  }
}

packageExtension();
