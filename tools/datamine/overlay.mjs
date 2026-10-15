// Render spawns from a dungeon JSON over a floor image: node overlay.mjs <json> <floorId> <image> <out.png>
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const [, , jsonPath, floorId, image, out] = process.argv;
const d = JSON.parse(readFileSync(jsonPath, 'utf8'));
const meta = await sharp(image).metadata();
const W = 1600, H = Math.round((meta.height * W) / meta.width);
const enemy = Object.fromEntries(d.enemies.map((e) => [e.id, e]));
const dots = d.spawns.filter((s) => s.floor === floorId).map((s) => {
	const e = enemy[s.enemyId];
	const c = e.type === 'boss' ? '#facc15' : '#ef4444';
	return `<circle cx="${s.x * W}" cy="${s.y * H}" r="${e.type === 'boss' ? 9 : 5}" fill="${c}" stroke="#000" stroke-width="1.5"/>`;
}).join('');
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${dots}</svg>`);
await sharp(image).resize(W, H).composite([{ input: svg }]).png().toFile(out);
