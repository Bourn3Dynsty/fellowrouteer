// Route document: what a user builds in the planner, plus compact share encoding.

export type Pt = { x: number; y: number };
export type FloorPt = Pt & { floor: string };

export interface RoutePull {
	id: string;
	color: string;
	/** Map spawn ids in this pull. */
	spawns: string[];
	note?: string;
}

export type Annotation =
	| { id: string; kind: 'path'; floor: string; points: Pt[]; color: string; arrow?: boolean }
	| { id: string; kind: 'stealth'; floor: string; from: Pt; to: Pt }
	| { id: string; kind: 'portal'; a: FloorPt; b: FloorPt }
	| { id: string; kind: 'note'; floor: string; at: Pt; text: string };

export type AnnotationKind = Annotation['kind'];

export interface RouteDoc {
	v: 2;
	id: string;
	name: string;
	/** Dungeon slug. */
	dungeon: string;
	pulls: RoutePull[];
	/** Spawn ids turned into chickens (Ancient Poultry Fetish): no kill score. */
	chickens: string[];
	annotations: Annotation[];
	/** Active dungeon affixes (ids from affixes.json). */
	affixes?: string[];
	/** Key level the route is planned for (sets affixes and enemy health). */
	level?: number;
	updatedAt: number;
}

// Picked to stay readable on the parchment-coloured game maps.
export const PULL_COLORS = [
	'#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2',
	'#db2777', '#65a30d', '#c2410c', '#4f46e5', '#0d9488', '#a21caf'
];

export const STEALTH_COLOR = '#a855f7';
export const PORTAL_COLOR = '#06b6d4';

export function uid(): string {
	return crypto.randomUUID().slice(0, 8);
}

export function newRoute(dungeon: string, name = 'New route'): RouteDoc {
	return { v: 2, id: uid(), name, dungeon, pulls: [], chickens: [], annotations: [], affixes: [], updatedAt: Date.now() };
}

// --- share encoding ---------------------------------------------------------
// Spawn ids look like "<slug>-<n>", so only n is stored. The JSON is deflated and
// base64url-encoded; "j." marks an uncompressed fallback for old browsers.

interface Compact {
	v: 2;
	d: string;
	n: string;
	p: [number, (number | string)[], string?][];
	c: number[];
	a: unknown[];
	x?: string[];
}

const round = (v: number) => Math.round(v * 10000) / 10000;
// Mini-boss spawns ("<slug>-mb-<affix>") are stored as strings.
const spawnNum = (id: string): number | string => {
	const n = Number(id.slice(id.lastIndexOf('-') + 1));
	return id.includes('-mb-') ? id.slice(id.indexOf('-mb-') + 1) : n;
};

function roundPts<T>(value: T): T {
	if (typeof value === 'number') return round(value) as T;
	if (Array.isArray(value)) return value.map(roundPts) as T;
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundPts(v)])) as T;
	}
	return value;
}

function toCompact(doc: RouteDoc): Compact {
	return {
		v: 2,
		d: doc.dungeon,
		n: doc.name,
		p: doc.pulls.map((p) => {
			const color = Math.max(0, PULL_COLORS.indexOf(p.color));
			const row: [number, (number | string)[], string?] = [color, p.spawns.map(spawnNum)];
			if (p.note) row.push(p.note);
			return row;
		}),
		c: doc.chickens.map(spawnNum).filter((n): n is number => typeof n === 'number'),
		a: doc.annotations.map(({ id: _id, ...rest }) => roundPts(rest)),
		...(doc.affixes?.length ? { x: doc.affixes } : {})
	};
}

function fromCompact(c: Compact): RouteDoc {
	if (c.v !== 2 || typeof c.d !== 'string') throw new Error('Not a route');
	const sid = (n: number | string) => `${c.d}-${n}`;
	return {
		v: 2,
		id: uid(),
		name: c.n || 'Imported route',
		dungeon: c.d,
		pulls: c.p.map(([color, spawns, note]) => ({
			id: uid(),
			color: PULL_COLORS[color] ?? PULL_COLORS[0],
			spawns: spawns.map(sid),
			...(note ? { note } : {})
		})),
		chickens: (c.c ?? []).map(sid),
		annotations: (c.a ?? []).map((a) => ({ ...(a as Annotation), id: uid() })),
		affixes: c.x ?? [],
		updatedAt: Date.now()
	};
}

function toBase64Url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
	const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
	return new Uint8Array(await out.arrayBuffer());
}

export async function encodeRoute(doc: RouteDoc): Promise<string> {
	const json = new TextEncoder().encode(JSON.stringify(toCompact(doc)));
	if (typeof CompressionStream === 'undefined') return 'j.' + toBase64Url(json);
	return 'z.' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeRoute(input: string): Promise<RouteDoc> {
	let s = input.trim();
	const hash = s.match(/[#&?]r=([^&#\s]+)/);
	if (hash) s = hash[1];
	const [kind, payload] = [s.slice(0, 2), s.slice(2)];
	let bytes: Uint8Array;
	if (kind === 'z.') bytes = await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'));
	else if (kind === 'j.') bytes = fromBase64Url(payload);
	else throw new Error('Unrecognised route string');
	return fromCompact(JSON.parse(new TextDecoder().decode(bytes)));
}
