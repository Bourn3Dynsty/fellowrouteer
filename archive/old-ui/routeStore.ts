import { writable } from 'svelte/store';
import type { Pull } from '../types';

interface RouteStorage {
	[dungeonId: string]: {
		pulls: Pull[];
		lastModified: string;
	};
}

function createRouteStore() {
	const isBrowser = typeof window !== 'undefined';
	const STORAGE_KEY = 'fellowroute_routes_v2';

	function loadFromStorage(): RouteStorage {
		if (!isBrowser) return {};
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			return stored ? JSON.parse(stored) : {};
		} catch (e) {
			console.error('Failed to load routes from storage:', e);
			return {};
		}
	}

	function saveToStorage(data: RouteStorage) {
		if (!isBrowser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (e) {
			console.error('Failed to save routes to storage:', e);
		}
	}

	const store = writable<RouteStorage>(loadFromStorage());

	return {
		subscribe: store.subscribe,
		saveRoute: (dungeonId: string, pulls: Pull[]) => {
			store.update((storage) => {
				const updated = {
					...storage,
					[dungeonId]: {
						pulls,
						lastModified: new Date().toISOString()
					}
				};
				saveToStorage(updated);
				return updated;
			});
		},
		loadRoute: (dungeonId: string): Pull[] | null => {
			const storage = loadFromStorage();
			return storage[dungeonId]?.pulls || null;
		},
		clearRoute: (dungeonId: string) => {
			store.update((storage) => {
				const updated = { ...storage };
				delete updated[dungeonId];
				saveToStorage(updated);
				return updated;
			});
		},
		clearAll: () => {
			if (isBrowser) {
				localStorage.removeItem(STORAGE_KEY);
			}
			store.set({});
		}
	};
}

export const routeStore = createRouteStore();
