// Live planning sessions: a small WebSocket relay that keeps the latest route for each room in
// memory and forwards edits and cursors between everyone in it. Used by the Vite dev server
// (vite.config.ts) and the production server (server/index.js).
import { WebSocketServer } from 'ws';

export const SESSION_PATH = '/ws/session';

const MAX_MEMBERS = 12;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // forget empty rooms after 6h
const ROOM_ID = /^[a-z0-9]{6,16}$/;

/** @type {Map<string, { doc: unknown, members: Map<string, any>, touched: number }>} */
const rooms = new Map();
let nextId = 1;

function send(ws, msg) {
	if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
	for (const [id, m] of room.members) if (id !== exceptId) send(m.ws, msg);
}

function publicMember(id, m) {
	return { id, name: m.name, color: m.color, cursor: m.cursor, pull: m.pull };
}

function clean(str, max) {
	return String(str ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

function handle(ws) {
	const id = String(nextId++);
	let room = null;

	ws.on('message', (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		if (msg.t === 'join' && !room) {
			const roomId = String(msg.room ?? '');
			if (!ROOM_ID.test(roomId)) return send(ws, { t: 'error', message: 'Invalid session id' });
			room = rooms.get(roomId);
			if (!room) {
				room = { doc: msg.doc ?? null, members: new Map(), touched: Date.now() };
				rooms.set(roomId, room);
			} else if (room.members.size >= MAX_MEMBERS) {
				room = null;
				return send(ws, { t: 'error', message: 'This session is full' });
			}
			if (!room.doc && msg.doc) room.doc = msg.doc;
			const member = { ws, name: clean(msg.name, 24) || 'Player', color: clean(msg.color, 9) || '#d9ad5b', cursor: null, pull: null };
			room.members.set(id, member);
			send(ws, {
				t: 'welcome',
				you: id,
				doc: room.doc,
				members: [...room.members].map(([mid, m]) => publicMember(mid, m))
			});
			broadcast(room, { t: 'join', member: publicMember(id, member) }, id);
			return;
		}

		if (!room) return;
		room.touched = Date.now();
		const me = room.members.get(id);

		if (msg.t === 'doc' && msg.doc && typeof msg.doc === 'object') {
			room.doc = msg.doc;
			broadcast(room, { t: 'doc', doc: msg.doc, from: id }, id);
		} else if (msg.t === 'presence' && me) {
			me.cursor = msg.cursor ?? null;
			me.pull = msg.pull ?? null;
			broadcast(room, { t: 'presence', id, cursor: me.cursor, pull: me.pull }, id);
		} else if (msg.t === 'rename' && me) {
			me.name = clean(msg.name, 24) || me.name;
			broadcast(room, { t: 'join', member: publicMember(id, me) }, id);
		}
	});

	ws.on('close', () => {
		if (!room) return;
		room.members.delete(id);
		room.touched = Date.now();
		broadcast(room, { t: 'leave', id });
	});
}

setInterval(() => {
	const now = Date.now();
	for (const [rid, room] of rooms) {
		if (!room.members.size && now - room.touched > ROOM_TTL_MS) rooms.delete(rid);
	}
}, 10 * 60 * 1000).unref();

/** Attach the relay to an http(s) server's upgrade event. */
export function attachSessionRelay(httpServer) {
	const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
	wss.on('connection', handle);
	httpServer.on('upgrade', (req, socket, head) => {
		if (!req.url?.startsWith(SESSION_PATH)) return;
		wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
	});
	return wss;
}
