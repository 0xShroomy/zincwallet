// Quick script to create placeholder icons using Canvas (Node.js)
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

function createIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Zinc yellow/gold gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#f59e0b');
  gradient.addColorStop(1, '#d97706');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // Draw "Z" in white
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Z', size / 2, size / 2);
  
  // Save
  mkdirSync(dirname(outputPath), { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(outputPath, buffer);
  console.log(`Created ${outputPath}`);
}

createIcon(16, 'public/icons/icon16.png');
createIcon(48, 'public/icons/icon48.png');
createIcon(128, 'public/icons/icon128.png');
