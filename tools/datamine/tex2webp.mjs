// Decode a dumped cooked Texture2D export and write WebP.
// usage: node tex2webp.mjs <export.bin> <out.webp> [maxSize] [--square]
// Supports DXT1, DXT5 and B8G8R8A8. The top mip is read inline from the export, or from
// bulk.bin (the texture's .ubulk) next to it, where the largest mip is stored first.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const [, , input, output, maxArg = '2048', ...flags] = process.argv;
const square = flags.includes('--square');
const b = readFileSync(input);
const i = b.indexOf('PF_');
const n = b.readInt32LE(i - 4);
const fmt = b.toString('latin1', i, i + n - 1);
const w = b.readInt32LE(i - 16), h = b.readInt32LE(i - 12);

const bytesPerBlock = { PF_DXT1: 8, PF_DXT5: 16 }[fmt];
const size = fmt === 'PF_B8G8R8A8' ? w * h * 4 : bytesPerBlock ? (w * h * bytesPerBlock) / 16 : 0;
if (!size) throw new Error(`unsupported format ${fmt}`);

let data;
const start = i + n + 12;
if (b.length - start >= size) {
	data = b.subarray(start, start + size);
} else {
	const bulk = join(dirname(input), 'bulk.bin');
	if (!existsSync(bulk)) throw new Error('top mip is not inline and bulk.bin is missing');
	data = readFileSync(bulk).subarray(0, size);
	if (data.length < size) throw new Error('bulk.bin is smaller than the top mip');
}

const px = Buffer.alloc(w * h * 4);
if (fmt === 'PF_B8G8R8A8') {
	for (let p = 0; p < w * h * 4; p += 4) {
		px[p] = data[p + 2]; px[p + 1] = data[p + 1]; px[p + 2] = data[p]; px[p + 3] = data[p + 3];
	}
} else {
	decodeBlocks();
}

function decodeBlocks() {
	const c565 = (c) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
	const dxt5 = fmt === 'PF_DXT5';
	let o = 0;
	for (let by = 0; by < h; by += 4) {
		for (let bx = 0; bx < w; bx += 4) {
			let alpha = null;
			if (dxt5) {
				const a0 = data[o], a1 = data[o + 1];
				const pal = [a0, a1];
				if (a0 > a1) for (let k = 1; k < 7; k++) pal.push(((7 - k) * a0 + k * a1) / 7);
				else { for (let k = 1; k < 5; k++) pal.push(((5 - k) * a0 + k * a1) / 5); pal.push(0, 255); }
				let bits = 0n;
				for (let k = 0; k < 6; k++) bits |= BigInt(data[o + 2 + k]) << BigInt(8 * k);
				alpha = Array.from({ length: 16 }, (_, k) => pal[Number((bits >> BigInt(3 * k)) & 7n)]);
				o += 8;
			}
			const c0 = data.readUInt16LE(o), c1 = data.readUInt16LE(o + 2), idx = data.readUInt32LE(o + 4);
			const a = c565(c0), c = c565(c1);
			const four = c0 > c1 || dxt5;
			const pal = [a, c,
				four ? a.map((v, k) => (2 * v + c[k]) / 3) : a.map((v, k) => (v + c[k]) / 2),
				four ? a.map((v, k) => (v + 2 * c[k]) / 3) : [0, 0, 0]];
			for (let p = 0; p < 16; p++) {
				const x = bx + (p & 3), y = by + (p >> 2);
				if (x >= w || y >= h) continue;
				const sel = (idx >>> (2 * p)) & 3;
				const q = (y * w + x) * 4;
				px[q] = pal[sel][0]; px[q + 1] = pal[sel][1]; px[q + 2] = pal[sel][2];
				px[q + 3] = alpha ? alpha[p] : !four && sel === 3 ? 0 : 255;
			}
			o += 8;
		}
	}
}

const max = Number(maxArg);
let img = sharp(px, { raw: { width: w, height: h, channels: 4 } });
let outW, outH;
if (square) {
	outW = outH = Math.min(max, w, h);
	img = img.resize(outW, outH, { fit: 'cover' });
} else {
	outW = Math.min(w, max);
	outH = Math.round((h * outW) / w);
	img = img.resize(outW, outH);
}
await img.webp({ quality: square ? 90 : 82, alphaQuality: 100 }).toFile(output);
console.log(JSON.stringify({ input, fmt, width: outW, height: outH }));
