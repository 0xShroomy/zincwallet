#!/usr/bin/env node
/**
 * Post-build script to remove CSS references from content_scripts in manifest
 * CSS should NEVER be injected into web pages by content scripts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, '../dist/manifest.json');
const ignoredCssPath = path.join(__dirname, '../dist/ignored-style.css');

// Read manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Remove CSS from content_scripts
if (manifest.content_scripts) {
  manifest.content_scripts.forEach(script => {
    if (script.css) {
      console.log('[PostBuild] Removing CSS from content_scripts:', script.css);
      delete script.css;
    }
  });
}

// Write cleaned manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('[PostBuild] ✓ Manifest cleaned - no CSS in content_scripts');

// Delete ignored CSS file
if (fs.existsSync(ignoredCssPath)) {
  fs.unlinkSync(ignoredCssPath);
  console.log('[PostBuild] ✓ Deleted ignored-style.css');
}

console.log('[PostBuild] ✓ Build cleanup complete!');
