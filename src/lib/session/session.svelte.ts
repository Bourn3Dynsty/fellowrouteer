import type { RouteEditor } from '$lib/route/editor.svelte';
import type { RouteDoc } from '$lib/route/model';

// Live planning session: everyone in a room edits the same route. The relay (server/relay.js)
// keeps the latest document; each change sends the whole route (they're small), last write wins.

export interface Member {
	id: string;
	name: string;
	color: string;
	cursor: { x: number; y: number; floor: string } | null;
	pull: string | null;
}

export const PLAYER_COLORS = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#a3e635'];
const PLAYER_KEY = 'fellowroute.player';

export function loadPlayer(): { name: string; color: string } {
	try {
		const p = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? 'null');
		if (p?.name) return p;
	} catch {}
	return { name: '', color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)] };
}

export function savePlayer(p: { name: string; color: string }) {
	try {
		localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
	} catch {}
}

export function newRoomId(): string {
	const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
	return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => alphabet[b % alphabet.length]).join('');
}

export class LiveSession {
	status = $state<'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'>('idle');
	room = $state<string | null>(null);
	you = $state<string | null>(null);
	members = $state<Member[]>([]);
	error = $state<string | null>(null);

	#editor: RouteEditor;
	#ws: WebSocket | null = null;
	#player = { name: 'Player', color: PLAYER_COLORS[0] };
	#host = false;
	#docTimer: ReturnType<typeof setTimeout> | undefined;
	#presenceTimer: ReturnType<typeof setTimeout> | undefined;
	#pendingPresence: { cursor: Member['cursor']; pull: string | null } | null = null;
	#retries = 0;
	#closed = false;
	onRemoteDoc?: (doc: RouteDoc) => void;

	constructor(editor: RouteEditor) {
		this.#editor = editor;
	}

	/** Others in the session (not you). */
	others = $derived(this.members.filter((m) => m.id !== this.you));

	get live() {
		return this.status === 'live';
	}

	start(room: string, player: { name: string; color: string }, host: boolean) {
		this.room = room;
		this.#player = player;
		this.#host = host;
		this.#closed = false;
		this.#connect();
	}

	#connect() {
		this.status = this.#retries ? 'reconnecting' : 'connecting';
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		const ws = new WebSocket(`${proto}://${location.host}/ws/session`);
		this.#ws = ws;
		ws.onopen = () => {
			this.#retries = 0;
			ws.send(JSON.stringify({
				t: 'join',
				room: this.room,
				name: this.#player.name,
				color: this.#player.color,
				// The host seeds the room with their route; joiners adopt the room's route.
				doc: this.#host ? $state.snapshot(this.#editor.doc) : undefined
			}));
		};
		ws.onmessage = (e) => this.#onMessage(JSON.parse(e.data));
		ws.onclose = () => {
			if (this.#closed) return;
			this.status = 'reconnecting';
			const delay = Math.min(1000 * 2 ** this.#retries++, 15000);
			setTimeout(() => !this.#closed && this.#connect(), delay);
		};
	}

	#onMessage(msg: any) {
		switch (msg.t) {
			case 'welcome':
				this.you = msg.you;
				this.members = msg.members;
				this.status = 'live';
				this.error = null;
				// After a reconnect the host is just another member.
				this.#host = false;
				if (msg.doc) this.#applyRemote(msg.doc);
				break;
			case 'doc':
				this.#applyRemote(msg.doc);
				break;
			case 'join':
				this.members = [...this.members.filter((m) => m.id !== msg.member.id), msg.member];
				break;
			case 'leave':
				this.members = this.members.filter((m) => m.id !== msg.id);
				break;
			case 'presence':
				this.members = this.members.map((m) => (m.id === msg.id ? { ...m, cursor: msg.cursor, pull: msg.pull } : m));
				break;
			case 'error':
				this.error = msg.message;
				this.status = 'error';
				this.leave();
				break;
		}
	}

	#applyRemote(doc: RouteDoc) {
		this.#editor.applyRemote(doc);
		this.onRemoteDoc?.(doc);
	}

	/** Call after a local change; sends the route shortly after the last edit. */
	pushDoc() {
		if (this.status !== 'live') return;
		clearTimeout(this.#docTimer);
		this.#docTimer = setTimeout(() => {
			this.#send({ t: 'doc', doc: $state.snapshot(this.#editor.doc) });
		}, 80);
	}

	/** Share your cursor and selected pull (throttled). */
	presence(cursor: Member['cursor'], pull: string | null) {
		if (this.status !== 'live') return;
		this.#pendingPresence = { cursor, pull };
		if (this.#presenceTimer) return;
		this.#presenceTimer = setTimeout(() => {
			this.#presenceTimer = undefined;
			if (this.#pendingPresence) this.#send({ t: 'presence', ...this.#pendingPresence });
			this.#pendingPresence = null;
		}, 60);
	}

	rename(name: string) {
		this.#player.name = name;
		this.#send({ t: 'rename', name });
	}

	#send(msg: unknown) {
		if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(msg));
	}

	leave() {
		this.#closed = true;
		this.#ws?.close();
		this.#ws = null;
		if (this.status !== 'error') this.status = 'idle';
		this.members = [];
		this.you = null;
		this.room = null;
	}
}
