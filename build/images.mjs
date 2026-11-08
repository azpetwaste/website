// One time image job (run locally, outputs are committed in static/): social share card, app icons, favicon.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH || '/opt/npm-tools/node_modules/sharp');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'static/assets/img');
const icon = fs.readFileSync(path.join(IMG, 'icon.svg'));
const seal = fs.readFileSync(path.join(IMG, 'badge-dark.svg'));

for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(icon, { density: 400 }).resize(size, size).png().toFile(path.join(IMG, file));
}
await sharp(icon, { density: 400 }).resize(180, 180).png().toFile(path.join(ROOT, 'static/apple-touch-icon.png'));

// favicon.ico holding one 32px PNG
const png32 = await sharp(icon, { density: 300 }).resize(32, 32).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(ROOT, 'static/favicon.ico'), Buffer.concat([head, png32]));

// 1200 x 630 share card
const sealUri = 'data:image/svg+xml;base64,' + seal.toString('base64');
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0A0F24"/>
<circle cx="1010" cy="-40" r="300" fill="#FF4A1C" opacity=".12"/>
<image href="${sealUri}" x="820" y="150" width="330" height="330"/>
<text x="72" y="118" font-family="Inter" font-weight="700" font-size="28" letter-spacing="3" fill="#FF8A66">ARIZONA PET WASTE</text>
<text font-family="Inter Display" font-weight="800" font-size="86" letter-spacing="-3" fill="#F6F4EF"><tspan x="68" y="232">Dog poop pickup</tspan><tspan x="68" y="330">you can watch<tspan fill="#FF4A1C">.</tspan></tspan></text>
<rect x="72" y="380" width="330" height="64" rx="32" fill="#FF4A1C"/>
<text x="237" y="422" text-anchor="middle" font-family="Inter" font-weight="800" font-size="28" fill="#0E1430">First month free</text>
<text x="72" y="502" font-family="Inter" font-weight="600" font-size="27" fill="#D5DAF0">Free sanitizer spray · A photo of your latched gate</text>
<text x="72" y="560" font-family="Inter" font-weight="600" font-size="24" fill="#AEB5D8">Verrado · Citrus Park · Goodyear · Litchfield Park · 623.309.6104</text>
</svg>`;
await sharp(Buffer.from(card)).png({ compressionLevel: 9 }).toFile(path.join(IMG, 'og.png'));
for (const f of ['og.png', 'icon-192.png', 'icon-512.png']) console.log(f, fs.statSync(path.join(IMG, f)).size, 'bytes');
