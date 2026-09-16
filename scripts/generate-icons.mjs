#!/usr/bin/env node
/**
 * Génère les icônes PNG de la PWA, au build.
 *
 * Les icônes ne sont pas versionnées : ce sont des binaires dérivés, et
 * ce script les reproduit à l'identique partout. Il n'a besoin d'aucune
 * dépendance — zlib est dans Node, et un PNG n'est qu'une suite de
 * morceaux préfixés d'une longueur et suivis d'un CRC.
 *
 * On dessine dans un tampon RGBA suréchantillonné 4×, puis on réduit :
 * c'est là que les bords se lissent.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SS = 4;
const BLUE = [42, 120, 214];
const WHITE = [255, 255, 255];

/** Couverture d'un rectangle à coins arrondis. */
function roundedRectMask(w, h, radius) {
  const mask = new Uint8Array(w * h);
  const corners = [
    [radius, radius, -1, -1],
    [w - radius, radius, 1, -1],
    [radius, h - radius, -1, 1],
    [w - radius, h - radius, 1, 1],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = true;
      for (const [cx, cy, sx, sy] of corners) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        // Hors du coin seulement si on est du mauvais côté des deux
        // axes ET au-delà du rayon.
        if (Math.sign(dx) === sx && Math.sign(dy) === sy && dx * dx + dy * dy > radius * radius) {
          inside = false;
          break;
        }
      }
      mask[y * w + x] = inside ? 255 : 0;
    }
  }
  return mask;
}

function draw(size, maskable) {
  const w = size * SS;
  const h = w;
  const corner = maskable ? 0 : Math.round(size * 0.22) * SS;

  const px = new Uint8Array(w * h * 4);
  const bg = corner ? roundedRectMask(w, h, corner) : new Uint8Array(w * h).fill(255);

  for (let i = 0; i < w * h; i++) {
    if (bg[i]) px.set([...BLUE, 255], i * 4);
  }

  // Quatre barres croissantes : la même marque que le logo de
  // l'interface. En version « maskable », tout est rentré vers le
  // centre pour rester dans la zone sûre du masque circulaire.
  const inset = maskable ? 0.3 : 0.22;
  const left = w * inset;
  const usable = w * (1 - 2 * inset);
  const barW = usable / 7;
  const radius = barW / 2;
  const baseline = h * (1 - inset);

  for (const [idx, frac] of [0.34, 0.6, 0.22, 0.78].entries()) {
    const x0 = left + idx * barW * 2;
    const x1 = x0 + barW;
    const y0 = baseline - usable * frac;
    const y1 = baseline;
    const cxBar = (x0 + x1) / 2;
    const capTop = y0 + radius;
    const capBottom = y1 - radius;

    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) {
        const fx = x + 0.5;
        const fy = y + 0.5;
        if (fy < capTop) {
          if ((fx - cxBar) ** 2 + (fy - capTop) ** 2 > radius * radius) continue;
        } else if (fy > capBottom) {
          if ((fx - cxBar) ** 2 + (fy - capBottom) ** 2 > radius * radius) continue;
        } else if (fx < x0 || fx > x1) {
          continue;
        }
        px.set([...WHITE, 255], (y * w + x) * 4);
      }
    }
  }

  return downsample(px, w, size);
}

function downsample(px, w, size) {
  const out = new Uint8Array(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * w + (x * SS + dx)) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
        }
      }
      out.set([(r / n) | 0, (g / n) | 0, (b / n) | 0, (a / n) | 0], (y * size + x) * 4);
    }
  }
  return out;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(tag, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  // Un octet de filtre « None » en tête de chaque ligne.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RVB + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, true],
]) {
  writeFileSync(join(out, name), encodePng(draw(size, maskable), size));
  console.log(`  icônes : ${name} (${size}×${size})`);
}
