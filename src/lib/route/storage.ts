import { newRoute, type RouteDoc } from './model';

// Saved routes live in this browser's localStorage, many per dungeon.

const ROUTES_KEY = 'fellowroute.routes.v2';
const ACTIVE_KEY = 'fellowroute.active.v2';

const isBrowser = typeof window !== 'undefined';

function read<T>(key: string, fallback: T): T {
	if (!isBrowser) return fallback;
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function write(key: string, value: unknown) {
	if (!isBrowser) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (e) {
		console.error('Failed to save routes:', e);
	}
}

export function allRoutes(): RouteDoc[] {
	return Object.values(read<Record<string, RouteDoc>>(ROUTES_KEY, {})).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function routesFor(dungeon: string): RouteDoc[] {
	return allRoutes().filter((r) => r.dungeon === dungeon);
}

export function saveRoute(doc: RouteDoc) {
	const all = read<Record<string, RouteDoc>>(ROUTES_KEY, {});
	all[doc.id] = doc;
	write(ROUTES_KEY, all);
}

export function deleteRoute(id: string) {
	const all = read<Record<string, RouteDoc>>(ROUTES_KEY, {});
	delete all[id];
	write(ROUTES_KEY, all);
}

export function activeRouteId(dungeon: string): string | null {
	return read<Record<string, string>>(ACTIVE_KEY, {})[dungeon] ?? null;
}

export function setActiveRoute(dungeon: string, id: string) {
	const all = read<Record<string, string>>(ACTIVE_KEY, {});
	all[dungeon] = id;
	write(ACTIVE_KEY, all);
}

/** The route to open for a dungeon: the last active one, else the newest, else a new one. */
export function openRoute(dungeon: string): RouteDoc {
	const routes = routesFor(dungeon);
	const active = activeRouteId(dungeon);
	return routes.find((r) => r.id === active) ?? routes[0] ?? newRoute(dungeon);
}
