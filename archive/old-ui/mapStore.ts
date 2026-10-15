import type { Dungeon, EnemyPosition, MapFloor } from '../types';

// Local overrides for dungeon maps: a user-supplied map image (IndexedDB, since
// images are too large for localStorage) and edited spawn layouts (localStorage).

const SPAWNS_KEY = 'fellowroute_spawns_v2';
const DB_NAME = 'fellowroute';
const IMAGE_STORE = 'map-images';

const isBrowser = typeof window !== 'undefined';

function readSpawnOverrides(): Record<string, EnemyPosition[]> {
	if (!isBrowser) return {};
	try {
		const stored = localStorage.getItem(SPAWNS_KEY);
		return stored ? JSON.parse(stored) : {};
	} catch (e) {
		console.error('Failed to load spawn overrides:', e);
		return {};
	}
}

export function loadSpawnOverride(dungeonId: string): EnemyPosition[] | null {
	return readSpawnOverrides()[dungeonId] ?? null;
}

export function saveSpawnOverride(dungeonId: string, spawns: EnemyPosition[]) {
	if (!isBrowser) return;
	try {
		const all = readSpawnOverrides();
		all[dungeonId] = spawns;
		localStorage.setItem(SPAWNS_KEY, JSON.stringify(all));
	} catch (e) {
		console.error('Failed to save spawn overrides:', e);
	}
}

export function clearSpawnOverride(dungeonId: string) {
	if (!isBrowser) return;
	try {
		const all = readSpawnOverrides();
		delete all[dungeonId];
		localStorage.setItem(SPAWNS_KEY, JSON.stringify(all));
	} catch (e) {
		console.error('Failed to clear spawn overrides:', e);
	}
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(IMAGE_STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const req = fn(db.transaction(IMAGE_STORE, mode).objectStore(IMAGE_STORE));
		req.onsuccess = () => resolve(req.result as T);
		req.onerror = () => reject(req.error);
	});
}

export async function loadCustomMapImage(dungeonId: string): Promise<Blob | null> {
	if (!isBrowser || !('indexedDB' in window)) return null;
	try {
		return (await withStore<Blob | undefined>('readonly', (s) => s.get(dungeonId))) ?? null;
	} catch (e) {
		console.error('Failed to load custom map image:', e);
		return null;
	}
}

export async function saveCustomMapImage(dungeonId: string, image: Blob) {
	await withStore('readwrite', (s) => s.put(image, dungeonId));
}

export async function clearCustomMapImage(dungeonId: string) {
	await withStore('readwrite', (s) => s.delete(dungeonId));
}

/** Candidate URLs for a floor's bundled map image, tried in order. */
export function mapImageCandidates(dungeon: Dungeon, floor?: MapFloor): string[] {
	if (floor?.image) return [floor.image];
	return ['webp', 'png', 'jpg'].map((ext) => `/maps/${dungeon.slug}.${ext}`);
}

/**
 * Placeholder layout used until real spawns are placed: one pack per trash
 * type, spread over the map so the planner is still usable.
 */
export function placeholderSpawns(dungeon: Dungeon): EnemyPosition[] {
	const trash = dungeon.enemies.filter((e) => e.type !== 'boss');
	const cols = Math.ceil(Math.sqrt(trash.length));
	const rows = Math.ceil(trash.length / cols);
	return trash.map((enemy, i) => ({
		id: `placeholder-${enemy.id}`,
		enemyId: enemy.id,
		x: (0.5 + (i % cols)) / cols,
		y: (0.5 + Math.floor(i / cols)) / rows,
		pack: i + 1
	}));
}
