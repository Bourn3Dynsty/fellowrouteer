<script lang="ts" module>
	export type Tool = 'select' | 'draw' | 'arrow' | 'stealth' | 'portal' | 'note' | 'erase';
</script>

<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { layers, LAYER_INFO, type Layer } from '$lib/route/layers.svelte';
	import { fmtHealth } from '$lib/data/levels';
	import { createRatings, ratingColor } from '$lib/route/efficiency.svelte';
	import type { EnemyPosition } from '$lib/types';
	import type { RouteEditor } from '$lib/route/editor.svelte';
	import { STEALTH_COLOR, PORTAL_COLOR, uid, type Annotation, type Pt } from '$lib/route/model';
	import { relicById } from '$lib/data/relics';
	import { affixById } from '$lib/data/affixes';
	import type { Member } from '$lib/session/session.svelte';

	interface Props {
		editor: RouteEditor;
		tool: Tool;
		floorId: string;
		/** Live-session teammates (their cursors are drawn on the map). */
		cursors?: Member[];
		/** Your cursor position, for live sessions. */
		onCursor?: (c: { x: number; y: number; floor: string } | null) => void;
	}

	let { editor, tool = $bindable(), floorId = $bindable(), cursors = [], onCursor }: Props = $props();

	const dungeon = untrack(() => editor.dungeon);
	// Marker radius in screen px at the fitted zoom; grows as you zoom in (capped).
	const MARKER = { trash: 8, boss: 12 };
	const MARKER_MAX = { trash: 17, boss: 24 };
	const DRAG_THRESHOLD = 4;
	const chickenIcon = relicById.chicken?.icon;
	const stealthIcon = relicById.stealth?.icon;
	const portalIcon = relicById.portal?.icon;

	let svg: SVGSVGElement;
	let viewW = $state(0);
	let viewH = $state(0);
	let zoom = $state(1);
	let pan = $state<Pt>({ x: 0, y: 0 });

	// Image size per floor (all game maps are 2:1; updated once the image loads).
	let sizes = $state<Record<string, { w: number; h: number }>>({});
	let size = $derived(sizes[floorId] ?? { w: 2048, h: 1024 });
	let floor = $derived(dungeon.floors.find((f) => f.id === floorId) ?? dungeon.floors[0]);
	let imageReady = $state<Record<string, boolean>>({});
	let fittedFloor: string | null = null;

	const firstFloor = dungeon.floors[0]?.id ?? 'f1';
	let floorSpawns = $derived(
		[...dungeon.enemyPositions, ...editor.activeMinibosses].filter(
			(s) => (s.floor ?? firstFloor) === floorId && !editor.isRemoved(s.id)
		)
	);
	let showLegend = $state(false);
	/** pack number -> efficiency rating, when the efficiency layer is on */
	const ratings = createRatings(untrack(() => editor));

	// --- patrol simulation ------------------------------------------------------
	// Walkers move along their path at a set walking speed: back and forth on open paths, round
	// and round on closed ones. Speed and pauses aren't in the game data we have, so the speed is
	// adjustable and the result is an estimate for timing pulls.
	const SIM_SPEED_KEY = 'fellowroute.patrolSpeed';
	let simTime = $state(0);
	let simPlaying = $state(false);
	let simRate = $state(1);
	let simSpeed = $state(250);
	try {
		const v = Number(localStorage.getItem(SIM_SPEED_KEY));
		if (v > 0) simSpeed = v;
	} catch {
		// default speed
	}
	let raf = 0;
	let last = 0;
	function simTick(now: number) {
		if (last) simTime = (simTime + ((now - last) / 1000) * simRate) % 3600;
		last = now;
		raf = requestAnimationFrame(simTick);
	}
	function simToggle() {
		simPlaying = !simPlaying;
		cancelAnimationFrame(raf);
		last = 0;
		if (simPlaying) raf = requestAnimationFrame(simTick);
	}
	function setSimSpeed(v: number) {
		simSpeed = v;
		try {
			localStorage.setItem(SIM_SPEED_KEY, String(v));
		} catch {
			// not persisted
		}
	}
	$effect(() => {
		if (!layers.on.patrolSim && simPlaying) simToggle();
	});
	onDestroy(() => {
		if (raf) cancelAnimationFrame(raf);
	});

	/** Per patrol on this floor: path in world units with cumulative lengths, and walker offsets. */
	let simPaths = $derived.by(() => {
		if (!layers.on.patrolSim) return [];
		const [W, H] = floor?.worldSize ?? [2 * size.w * 15, size.h * 30];
		return floorPatrols.map((p) => {
			const pts = p.points.map(([x, y]) => ({ x: x * W, y: y * H }));
			const cum = [0];
			for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
			const length = cum[cum.length - 1];
			const closed = pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 300;
			const walkers = p.spawns
				.map((id) => editor.spawnById.get(id))
				.filter((s): s is EnemyPosition => !!s && !editor.isRemoved(s.id))
				.map((s) => ({ id: s.id, enemyId: s.enemyId, dx: s.x - p.points[0][0], dy: s.y - p.points[0][1] }));
			return { id: p.id, pts, cum, length, closed, walkers, W, H };
		});
	});

	/** Normalized position along a path after `t` seconds. */
	function simPos(path: (typeof simPaths)[number], t: number) {
		const { pts, cum, length, closed, W, H } = path;
		if (!length) return { x: pts[0].x / W, y: pts[0].y / H };
		let d = t * simSpeed;
		if (closed) d %= length;
		else {
			d %= 2 * length;
			if (d > length) d = 2 * length - d;
		}
		let i = 1;
		while (i < cum.length - 1 && cum[i] < d) i++;
		const seg = cum[i] - cum[i - 1] || 1;
		const f = (d - cum[i - 1]) / seg;
		return { x: (pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f) / W, y: (pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f) / H };
	}

	const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
	let packRating = $derived(layers.on.effMap ? new Map(ratings.packs.map((p) => [p.pack, p.rating])) : null);
	let showLayers = $state(false);

	// Patrols on this floor that still have an enemy on the map.
	let floorPatrols = $derived(
		dungeon.patrols.filter((p) => p.floor === floorId && p.spawns.some((s) => !editor.isRemoved(s)))
	);
	/** Emphasise a patrol when one of its walkers is hovered, highlighted or in the selected pull. */
	function patrolActive(p: (typeof dungeon.patrols)[number]) {
		const sel = editor.selectedPull;
		return p.spawns.some(
			(s) => s === hoverSpawn || editor.activeHighlight?.has(s) || (sel && sel.spawns.includes(s))
		);
	}

	/** Per enemy type: has a kickable ability. */
	const kickable = new Set(dungeon.enemies.filter((e) => e.abilities.some((a) => a.interruptible)).map((e) => e.id));

	// --- interaction state -----------------------------------------------------
	let hoverSpawn = $state<string | null>(null);
	let hoverAnno = $state<string | null>(null);
	let mouse = $state<Pt>({ x: 0, y: 0 });
	let menu = $state<{ x: number; y: number; spawn?: string; anno?: string } | null>(null);
	// Note being written: a new one (id null) or an existing one being edited.
	let noteDraft = $state<{ id: string | null; at: Pt; text: string } | null>(null);
	let noteText = $state('');

	type Gesture = {
		kind: 'pan' | 'spawn' | 'path' | 'two' | 'rect' | 'note';
		start: Pt;
		last: Pt;
		moved: boolean;
		spawn?: string;
		single?: boolean;
	};
	let gesture = $state<Gesture | null>(null);
	let draftPath = $state<Pt[]>([]);
	let twoStart = $state<Pt | null>(null); // world-normalised start for arrow/stealth/portal
	let twoEnd = $state<Pt | null>(null);
	let rect = $state<{ a: Pt; b: Pt } | null>(null);

	// --- geometry helpers ------------------------------------------------------
	const toWorld = (p: Pt) => ({ x: p.x * size.w, y: p.y * size.h });
	function screenToNorm(s: Pt): Pt {
		return { x: (s.x - pan.x) / zoom / size.w, y: (s.y - pan.y) / zoom / size.h };
	}
	function normToScreen(p: Pt): Pt {
		return { x: p.x * size.w * zoom + pan.x, y: p.y * size.h * zoom + pan.y };
	}
	function screenPoint(e: MouseEvent): Pt {
		const r = svg.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	const px = (n: number) => n / zoom;

	let markerScale = $derived(Math.sqrt(Math.max(1, zoom / baseZoom())));

	function markerR(spawnId: string) {
		const type = editor.enemyOf(spawnId)?.type;
		const kind = type === 'boss' || type === 'miniboss' ? 'boss' : 'trash';
		return Math.min(MARKER[kind] * markerScale * 1.25, MARKER_MAX[kind]);
	}

	function hull(points: Pt[]): Pt[] {
		if (points.length < 3) return points;
		const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
		const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
		const lower: Pt[] = [];
		for (const p of pts) {
			while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
			lower.push(p);
		}
		const upper: Pt[] = [];
		for (const p of [...pts].reverse()) {
			while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
			upper.push(p);
		}
		return lower.slice(0, -1).concat(upper.slice(0, -1));
	}

	function hullPath(points: Pt[]): string {
		const h = hull(points);
		if (h.length === 1) return `M${h[0].x},${h[0].y} l0.01,0`;
		return 'M' + h.map((p) => `${p.x},${p.y}`).join(' L') + ' Z';
	}

	// --- derived render data ---------------------------------------------------
	let packs = $derived.by(() => {
		const groups = new Map<number, EnemyPosition[]>();
		for (const s of floorSpawns) {
			if (s.pack == null) continue;
			(groups.get(s.pack) ?? groups.set(s.pack, []).get(s.pack)!).push(s);
		}
		return [...groups.entries()].map(([pack, members]) => {
			const owners = new Set(members.map((m) => editor.owner.get(m.id)));
			const owner = owners.size === 1 ? [...owners][0] : undefined;
			return { pack, members, owner, d: hullPath(members.map(toWorld)) };
		});
	});

	let pullLabels = $derived.by(() => {
		const out: { index: number; color: string; x: number; y: number }[] = [];
		editor.doc.pulls.forEach((p, index) => {
			const pts = p.spawns
				.map((id) => editor.spawnById.get(id))
				.filter((s): s is EnemyPosition => !!s && (s.floor ?? dungeon.floors[0]?.id) === floorId)
				.map(toWorld);
			if (!pts.length) return;
			const top = pts.reduce((a, b) => (b.y < a.y ? b : a));
			out.push({ index, color: p.color, x: top.x, y: top.y });
		});
		return out;
	});

	let annotations = $derived(
		editor.doc.annotations.filter((a) =>
			a.kind === 'portal' ? a.a.floor === floorId || a.b.floor === floorId : a.floor === floorId
		)
	);

	let floorCounts = $derived(
		Object.fromEntries(
			dungeon.floors.map((f) => {
				const ids = dungeon.enemyPositions.filter((s) => (s.floor ?? dungeon.floors[0]?.id) === f.id);
				return [f.id, { total: ids.length, taken: ids.filter((s) => editor.owner.has(s.id)).length }];
			})
		)
	);

	// --- view ------------------------------------------------------------------
	export function fit() {
		if (!viewW || !viewH) return;
		const z = Math.min(viewW / size.w, (viewH - 8) / size.h) * 0.97;
		zoom = z;
		pan = { x: (viewW - size.w * z) / 2, y: (viewH - size.h * z) / 2 };
	}

	function baseZoom() {
		return Math.min(viewW / size.w, viewH / size.h) || 1;
	}

	function zoomAt(s: Pt, factor: number) {
		const b = baseZoom();
		const next = Math.max(b * 0.6, Math.min(b * 12, zoom * factor));
		pan = { x: s.x - (s.x - pan.x) * (next / zoom), y: s.y - (s.y - pan.y) * (next / zoom) };
		zoom = next;
	}

	/** Show a pull: switch to the floor holding most of it and frame it if it's off-screen. */
	export function focusPull(pullId: string) {
		const pull = editor.doc.pulls.find((p) => p.id === pullId);
		if (pull?.spawns.length) focusSpawns(pull.spawns);
	}

	/** Switch to the floor holding most of these spawns and frame them if they're off-screen. */
	export function focusSpawns(spawnIds: string[]) {
		const byFloor = new Map<string, EnemyPosition[]>();
		for (const id of spawnIds) {
			const s = editor.spawnById.get(id);
			if (!s) continue;
			const f = s.floor ?? dungeon.floors[0]?.id;
			(byFloor.get(f) ?? byFloor.set(f, []).get(f)!).push(s);
		}
		if (!byFloor.size) return;
		const [f, members] = [...byFloor.entries()].sort((a, b) => b[1].length - a[1].length)[0];
		if (f !== floorId) {
			floorId = f;
			fittedFloor = f;
		}
		queueMicrotask(() => {
			const pts = members.map((m) => normToScreen(m));
			const margin = 80;
			const visible = pts.every((p) => p.x > margin && p.y > margin && p.x < viewW - margin && p.y < viewH - margin);
			if (visible) return;
			const cx = members.reduce((t, m) => t + m.x, 0) / members.length;
			const cy = members.reduce((t, m) => t + m.y, 0) / members.length;
			const minZoom = baseZoom() * 1.6;
			if (zoom < minZoom) zoom = minZoom;
			pan = { x: viewW / 2 - cx * size.w * zoom, y: viewH / 2 - cy * size.h * zoom };
		});
	}

	// Load the floor image to learn its size; fit the view on first show.
	$effect(() => {
		const f = floor;
		if (!f) return;
		const img = new Image();
		img.onload = () => {
			sizes[f.id] = { w: img.naturalWidth, h: img.naturalHeight };
			imageReady[f.id] = true;
			if (fittedFloor !== f.id) {
				fittedFloor = f.id;
				queueMicrotask(fit);
			}
		};
		img.src = f.image;
	});

	$effect(() => {
		if (viewW && viewH && fittedFloor === null) fit();
	});

	// --- pointer handling ------------------------------------------------------
	function down(e: PointerEvent, spawn?: string) {
		menu = null;
		if (e.button === 2) return;
		const p = screenPoint(e);
		svg.setPointerCapture(e.pointerId);
		let kind: Gesture['kind'] = 'pan';
		if (e.button === 1) kind = 'pan';
		else if (tool === 'select') kind = spawn ? 'spawn' : e.shiftKey ? 'rect' : 'pan';
		else if (tool === 'draw') kind = 'path';
		else if (tool === 'arrow' || tool === 'stealth' || tool === 'portal') kind = 'two';
		else if (tool === 'note') kind = 'note';
		gesture = { kind, start: p, last: p, moved: false, spawn, single: e.ctrlKey || e.metaKey || e.altKey };
		const n = screenToNorm(p);
		if (kind === 'path') draftPath = [n];
		if (kind === 'two' && !twoStart) twoStart = n;
		if (kind === 'rect') rect = { a: n, b: n };
		e.stopPropagation();
	}

	function move(e: PointerEvent) {
		const p = screenPoint(e);
		mouse = p;
		if (onCursor) {
			const n = screenToNorm(p);
			onCursor({ x: Math.round(n.x * 10000) / 10000, y: Math.round(n.y * 10000) / 10000, floor: floorId });
		}
		if (twoStart && !gesture) twoEnd = screenToNorm(p);
		const g = gesture;
		if (!g) return;
		if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > DRAG_THRESHOLD) g.moved = true;
		if (g.moved) {
			if (g.kind === 'pan' || g.kind === 'spawn' || g.kind === 'note') {
				pan = { x: pan.x + p.x - g.last.x, y: pan.y + p.y - g.last.y };
				if (g.kind === 'spawn') g.kind = 'pan';
			} else if (g.kind === 'path') {
				draftPath.push(screenToNorm(p));
			} else if (g.kind === 'two') {
				twoEnd = screenToNorm(p);
			} else if (g.kind === 'rect' && rect) {
				rect.b = screenToNorm(p);
			}
		}
		g.last = p;
	}

	function up(e: PointerEvent) {
		const g = gesture;
		gesture = null;
		if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
		if (!g) return;
		const end = screenToNorm(screenPoint(e));

		if (g.kind === 'spawn' && g.spawn) {
			editor.toggleSpawns(g.single ? [g.spawn] : editor.packOf(g.spawn));
		} else if (g.kind === 'path') {
			if (draftPath.length > 2) {
				editor.addAnnotation({ id: uid(), kind: 'path', floor: floorId, points: simplify(draftPath), color: pathColor() });
			}
			draftPath = [];
		} else if (g.kind === 'two' && twoStart) {
			// Drag from start to end, or click start then click end.
			const dist = Math.hypot((end.x - twoStart.x) * size.w * zoom, (end.y - twoStart.y) * size.h * zoom);
			if (g.moved || dist > 10) {
				finishTwoPoint(twoStart, end);
				twoStart = null;
				twoEnd = null;
			}
		} else if (g.kind === 'rect' && rect) {
			selectRect(rect.a, rect.b);
			rect = null;
		} else if (g.kind === 'note' && !g.moved) {
			openNote(null, end, '');
		}
	}

	function pathColor() {
		return editor.selectedPull?.color ?? '#facc15';
	}

	function finishTwoPoint(a: Pt, b: Pt) {
		const id = uid();
		if (tool === 'arrow') editor.addAnnotation({ id, kind: 'path', floor: floorId, points: [a, b], color: pathColor(), arrow: true });
		else if (tool === 'stealth') editor.addAnnotation({ id, kind: 'stealth', floor: floorId, from: a, to: b });
		else if (tool === 'portal') editor.addAnnotation({ id, kind: 'portal', a: { ...a, floor: floorId }, b: { ...b, floor: floorId } });
	}

	function selectRect(a: Pt, b: Pt) {
		const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
		const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
		const ids = floorSpawns.filter((s) => s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2).map((s) => s.id);
		editor.toggleSpawns(ids, 'add');
	}

	/** Drop points closer than ~3 screen px to keep paths small. */
	function simplify(points: Pt[]): Pt[] {
		const out = [points[0]];
		for (const p of points.slice(1)) {
			const q = out[out.length - 1];
			if (Math.hypot((p.x - q.x) * size.w * zoom, (p.y - q.y) * size.h * zoom) > 3) out.push(p);
		}
		return out;
	}

	function wheel(e: WheelEvent) {
		e.preventDefault();
		zoomAt(screenPoint(e), e.deltaY > 0 ? 0.88 : 1.14);
	}

	function contextMenu(e: MouseEvent, target: { spawn?: string; anno?: string } = {}) {
		e.preventDefault();
		e.stopPropagation();
		if (twoStart) {
			twoStart = null;
			twoEnd = null;
			return;
		}
		if (!target.spawn && !target.anno) {
			menu = null;
			return;
		}
		const p = screenPoint(e);
		menu = { x: Math.min(p.x, viewW - 230), y: Math.min(p.y, viewH - 230), ...target };
	}

	function annoDown(e: PointerEvent, a: Annotation) {
		if (tool === 'erase' && e.button === 0) {
			e.stopPropagation();
			editor.removeAnnotation(a.id);
			hoverAnno = null;
		}
	}

	export function cancelDraft() {
		twoStart = null;
		twoEnd = null;
		draftPath = [];
		rect = null;
		menu = null;
	}

	// --- note editing ----------------------------------------------------------
	function openNote(id: string | null, at: Pt, text: string) {
		noteDraft = { id, at, text };
		noteText = text;
	}

	function commitNote() {
		const draft = noteDraft;
		if (!draft) return;
		noteDraft = null;
		const text = noteText.trim();
		if (draft.id === null) {
			if (text) editor.addAnnotation({ id: uid(), kind: 'note', floor: floorId, at: draft.at, text });
		} else if (!text) editor.removeAnnotation(draft.id);
		else if (text !== draft.text) editor.updateNote(draft.id, text);
	}

	function focusInput(node: HTMLTextAreaElement) {
		node.focus();
		node.select();
	}

	// --- tooltip data -----------------------------------------------------------
	let tip = $derived.by(() => {
		if (!hoverSpawn || gesture || menu) return null;
		const enemy = editor.enemyOf(hoverSpawn);
		if (!enemy) return null;
		const pack = editor.packOf(hoverSpawn);
		const owner = editor.owner.get(hoverSpawn);
		return {
			enemy,
			score: editor.spawnScore(hoverSpawn),
			empowered: editor.isEmpowered(hoverSpawn),
			patrol: editor.patrolOf.get(hoverSpawn),
			promoted: !!editor.spawnById.get(hoverSpawn)?.promoted,
			chicken: editor.chickens.has(hoverSpawn),
			packCount: pack.length,
			packScore: editor.scoreOf(pack),
			owner
		};
	});

	const fmtPct = (v: number) => `${v.toFixed(v < 10 ? 2 : 1)}%`;
</script>

<div class="map" bind:clientWidth={viewW} bind:clientHeight={viewH}>
	<svg
		bind:this={svg}
		class="tool-{tool}"
		class:panning={gesture?.kind === 'pan' && gesture.moved}
		role="application"
		aria-label="{dungeon.name} map"
		onpointerdown={(e) => down(e)}
		onpointermove={move}
		onpointerup={up}
		onpointerleave={() => {
			hoverSpawn = null;
			onCursor?.(null);
		}}
		onwheel={wheel}
		oncontextmenu={(e) => contextMenu(e)}
	>
		<defs>
			<clipPath id="clip-circle" clipPathUnits="objectBoundingBox">
				<circle cx="0.5" cy="0.5" r="0.5" />
			</clipPath>
			<filter id="desaturate">
				<feColorMatrix type="saturate" values="0.05" />
			</filter>
			<marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
				<path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
			</marker>
			<marker id="patrolhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto">
				<path d="M0,1 L9,5 L0,9 z" fill="context-stroke" />
			</marker>
		</defs>

		<g transform="translate({pan.x} {pan.y}) scale({zoom})">
			{#if floor}
				<image href={floor.image} width={size.w} height={size.h} class:hidden={!imageReady[floorId]} />
			{/if}
			<rect width={size.w} height={size.h} fill="none" stroke="#000" stroke-opacity="0.4" stroke-width={px(2)} />

			<!-- Pack halos -->
			{#each layers.on.halos || layers.on.effMap ? packs : [] as p (p.pack)}
				{@const rating = p.owner === undefined ? packRating?.get(p.pack) : undefined}
				{@const color = p.owner !== undefined ? editor.doc.pulls[p.owner].color : rating !== undefined ? ratingColor(rating) : '#0b0e14'}
				{@const selected = p.owner !== undefined && editor.doc.pulls[p.owner].id === editor.selectedPullId}
				{@const hovered = hoverSpawn !== null && p.members.some((m) => m.id === hoverSpawn)}
				<g class="halo" opacity={(p.owner !== undefined ? (selected ? 0.42 : 0.26) : rating !== undefined ? 0.38 : 0.16) + (hovered ? 0.18 : 0)}>
					<path d={p.d} fill={color} stroke={color} stroke-width={px(2 * (markerR(p.members[0].id) + 7))} stroke-linejoin="round" stroke-linecap="round" />
				</g>
			{/each}

			<!-- Patrol paths -->
			{#each layers.on.patrols ? floorPatrols : [] as p (p.id)}
				{@const owner = editor.owner.get(p.spawns[0])}
				{@const color = owner !== undefined ? editor.doc.pulls[owner].color : '#e2e8f0'}
				{@const active = patrolActive(p)}
				{@const pts = p.points.map(([x, y]) => `${x * size.w},${y * size.h}`).join(' ')}
				<g class="patrol" opacity={active ? 1 : 0.6}>
					<polyline points={pts} fill="none" stroke="#0b0e14" stroke-opacity="0.7" stroke-width={px(active ? 5.5 : 4)} stroke-linecap="round" stroke-linejoin="round" />
					<polyline points={pts} fill="none" stroke={color} stroke-width={px(active ? 2.6 : 1.8)}
						stroke-dasharray="{px(7)} {px(5)}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#patrolhead)" />
				</g>
			{/each}

			<!-- Annotations -->
			{#each annotations.filter((a) => (a.kind === 'note' ? layers.on.notes : layers.on.drawings)) as a (a.id)}
				<g
					class="anno"
					class:erasable={tool === 'erase'}
					class:hovered={hoverAnno === a.id && tool === 'erase'}
					role="presentation"
					onpointerdown={(e) => annoDown(e, a)}
					onpointerenter={() => (hoverAnno = a.id)}
					onpointerleave={() => (hoverAnno = null)}
					oncontextmenu={(e) => contextMenu(e, { anno: a.id })}
				>
					{#if a.kind === 'path'}
						{@const d = 'M' + a.points.map((p) => `${p.x * size.w},${p.y * size.h}`).join(' L')}
						<path {d} class="hit" stroke-width={px(14)} />
						<path {d} fill="none" stroke="#0b0e14" stroke-opacity="0.55" stroke-width={px(6)} stroke-linecap="round" stroke-linejoin="round" />
						<path {d} fill="none" stroke={a.color} stroke-width={px(3.5)} stroke-linecap="round" stroke-linejoin="round" marker-end={a.arrow ? 'url(#arrowhead)' : undefined} />
					{:else if a.kind === 'stealth'}
						{@const f = toWorld(a.from)}
						{@const t = toWorld(a.to)}
						<line x1={f.x} y1={f.y} x2={t.x} y2={t.y} class="hit" stroke-width={px(14)} />
						<line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#0b0e14" stroke-opacity="0.5" stroke-width={px(6)} stroke-linecap="round" />
						<line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={STEALTH_COLOR} stroke-width={px(3.5)} stroke-dasharray="{px(8)} {px(6)}" stroke-linecap="round" />
						{#each [f, t] as end, k}
							<g transform="translate({end.x} {end.y})">
								<circle r={px(13)} fill="#1a0f2b" stroke={STEALTH_COLOR} stroke-width={px(2.5)} />
								{#if stealthIcon}<image href={stealthIcon} x={px(-11)} y={px(-11)} width={px(22)} height={px(22)} clip-path="url(#clip-circle)" opacity={k ? 0.55 : 1} />{/if}
							</g>
						{/each}
					{:else if a.kind === 'portal'}
						{@const ends = [a.a, a.b]}
						{#if a.a.floor === a.b.floor}
							{@const p1 = toWorld(a.a)}
							{@const p2 = toWorld(a.b)}
							<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} class="hit" stroke-width={px(14)} />
							<line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={PORTAL_COLOR} stroke-width={px(2.5)} stroke-dasharray="{px(2)} {px(6)}" stroke-linecap="round" />
						{/if}
						{#each ends.filter((e) => e.floor === floorId) as end}
							{@const w = toWorld(end)}
							<g transform="translate({w.x} {w.y})">
								<circle r={px(14)} fill="#04212a" stroke={PORTAL_COLOR} stroke-width={px(2.5)} />
								{#if portalIcon}<image href={portalIcon} x={px(-12)} y={px(-12)} width={px(24)} height={px(24)} clip-path="url(#clip-circle)" />{/if}
							</g>
						{/each}
					{:else if a.kind === 'note'}
						{@const w = toWorld(a.at)}
						<g transform="translate({w.x} {w.y})">
							<circle r={px(9)} fill="#f8e7b5" stroke="#5b4214" stroke-width={px(2)} />
							<text class="note-glyph" font-size={px(11)} dy="0.35em">i</text>
						</g>
					{/if}
				</g>
			{/each}

			<!-- Drafts -->
			{#if draftPath.length > 1}
				<path d={'M' + draftPath.map((p) => `${p.x * size.w},${p.y * size.h}`).join(' L')} fill="none" stroke={pathColor()} stroke-width={px(3.5)} stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
			{/if}
			{#if twoStart && twoEnd}
				{@const a = toWorld(twoStart)}
				{@const b = toWorld(twoEnd)}
				<line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
					stroke={tool === 'stealth' ? STEALTH_COLOR : tool === 'portal' ? PORTAL_COLOR : pathColor()}
					stroke-width={px(3)} stroke-dasharray="{px(6)} {px(5)}" opacity="0.85" />
				<circle cx={a.x} cy={a.y} r={px(6)} fill={tool === 'stealth' ? STEALTH_COLOR : tool === 'portal' ? PORTAL_COLOR : pathColor()} />
			{/if}
			{#if rect}
				{@const a = toWorld(rect.a)}
				{@const b = toWorld(rect.b)}
				<rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)}
					fill="rgba(217,173,91,0.12)" stroke="var(--gold)" stroke-width={px(1.5)} stroke-dasharray="{px(5)} {px(4)}" />
			{/if}

			<!-- Start & checkpoints -->
			{#each layers.on.poi ? dungeon.checkpoints.filter((c) => c.floor === floorId) : [] as c}
				{@const w = toWorld(c)}
				<g class="poi" transform="translate({w.x} {w.y})">
					<rect x={px(-7)} y={px(-7)} width={px(14)} height={px(14)} rx={px(2)} transform="rotate(45)" fill="#1c1206" stroke="#f59e0b" stroke-width={px(2)} />
					<path d="M0 {px(-4)} C{px(3)} {px(-1)} {px(2)} {px(3)} 0 {px(4)} C{px(-2)} {px(3)} {px(-3)} {px(-1)} 0 {px(-4)}Z" fill="#fbbf24" />
				</g>
			{/each}
			{#if layers.on.poi && dungeon.start?.floor === floorId}
				{@const w = toWorld(dungeon.start)}
				<g class="poi" transform="translate({w.x} {w.y})">
					<circle r={px(15)} fill="#052e16" stroke="#22c55e" stroke-width={px(2.5)} />
					<path d="M{px(-4)} {px(8)} V{px(-8)} L{px(7)} {px(-4)} L{px(-4)} 0" fill="#4ade80" stroke="#4ade80" stroke-width={px(1.5)} stroke-linejoin="round" />
					<text class="poi-label" y={px(28)} font-size={px(11)}>START</text>
				</g>
			{/if}

			<!-- Spawns -->
			{#each floorSpawns as s (s.id)}
				{@const enemy = editor.enemyById.get(s.enemyId)}
				{@const r = px(markerR(s.id))}
				{@const ownerIdx = editor.owner.get(s.id)}
				{@const pull = ownerIdx !== undefined ? editor.doc.pulls[ownerIdx] : null}
				{@const chicken = editor.chickens.has(s.id)}
				{@const dim = editor.activeHighlight && !editor.activeHighlight.has(s.id)}
				{@const faded = layers.on.dimPulled && pull !== null && pull.id !== editor.selectedPullId}
				{@const hovered = hoverSpawn === s.id}
				{@const empowered = editor.isEmpowered(s.id)}
				{@const isMb = enemy?.type === 'miniboss'}
				<g
					class="spawn"
					class:dim
					class:faded
					transform="translate({s.x * size.w} {s.y * size.h}) scale({hovered ? 1.18 : 1})"
					role="button"
					tabindex="-1"
					aria-label={enemy?.name}
					onpointerdown={(e) => {
						if (tool === 'select' && e.button === 0) down(e, s.id);
					}}
					onpointerenter={() => (hoverSpawn = s.id)}
					onpointerleave={() => (hoverSpawn = null)}
					oncontextmenu={(e) => contextMenu(e, { spawn: s.id })}
				>
					<circle r={r + px(2)} fill="#0b0e14" />
					{#if enemy?.icon}
						<image href={enemy.icon} x={-r} y={-r} width={r * 2} height={r * 2} clip-path="url(#clip-circle)" filter={chicken ? 'url(#desaturate)' : undefined} opacity={chicken ? 0.55 : 1} />
					{:else}
						<circle {r} fill="#475569" />
					{/if}
					{#if empowered}
						<circle r={r + px(3.5)} fill="none" stroke="#facc15" stroke-width={px(2.5)} class="glow" />
					{/if}
					{#if isMb}
						<circle r={r + px(4)} fill="none" stroke="#7dd3fc" stroke-width={px(2)} stroke-dasharray="{px(3)} {px(2)}" />
					{/if}
					<circle {r} fill="none"
						stroke={pull ? pull.color : isMb ? '#7dd3fc' : enemy?.type === 'boss' ? 'var(--gold)' : '#f1f5f9'}
						stroke-width={px(pull ? 2.6 : enemy?.type === 'boss' || isMb ? 2.6 : 1.5)} />
					{#if chicken && chickenIcon}
						<image href={chickenIcon} x={r * 0.25} y={r * 0.25} width={r * 1.1} height={r * 1.1} clip-path="url(#clip-circle)" />
					{:else if layers.on.cc && enemy && enemy.type === 'trash' && markerScale > 1.15}
						{@const br = Math.max(r * 0.42, px(5))}
						{#if kickable.has(enemy.id)}
							<g transform="translate({-r * 0.78} {r * 0.72})">
								<circle r={br} fill="#1d4ed8" stroke="#0b0e14" stroke-width={px(1)} />
								<path d="M{br * 0.15} {-br * 0.65} L{-br * 0.4} {br * 0.1} H{br * 0.05} L{-br * 0.15} {br * 0.65} L{br * 0.45} {-br * 0.1} H0 Z" fill="#fff" />
							</g>
						{/if}
						{#if enemy.stunImmune}
							<g transform="translate({r * 0.78} {r * 0.72})">
								<circle r={br} fill="#b45309" stroke="#0b0e14" stroke-width={px(1)} />
								<circle r={br * 0.55} fill="none" stroke="#fff" stroke-width={br * 0.22} />
								<line x1={-br * 0.4} y1={br * 0.4} x2={br * 0.4} y2={-br * 0.4} stroke="#fff" stroke-width={br * 0.22} />
							</g>
						{/if}
					{/if}
					{#if s.promoted && markerScale > 1.15}
						<path transform="translate({r * 0.8} {-r * 0.85})" d="M{-px(5)} {px(2)} L0 {-px(3)} L{px(5)} {px(2)}" fill="none" stroke="#0b0e14" stroke-width={px(4.4)} stroke-linecap="round" stroke-linejoin="round" />
						<path transform="translate({r * 0.8} {-r * 0.85})" d="M{-px(5)} {px(2)} L0 {-px(3)} L{px(5)} {px(2)}" fill="none" stroke="#ef4444" stroke-width={px(2.4)} stroke-linecap="round" stroke-linejoin="round" />
					{/if}
					{#if empowered && markerScale > 1.15}
						<g transform="translate({-r * 0.8} {-r * 0.8})">
							<rect x={-px(8)} y={-px(5.5)} width={px(16)} height={px(11)} rx={px(3)} fill="#facc15" stroke="#0b0e14" stroke-width={px(1)} />
							<text class="badge-text" font-size={px(8)} dy="0.35em">×3</text>
						</g>
					{/if}
				</g>
			{/each}

			<!-- Patrol simulation: where each patrol is at the sim time -->
			{#each simPaths as path (path.id)}
				{@const at = simPos(path, simTime)}
				{#each path.walkers as w (w.id)}
					{@const e = editor.enemyById.get(w.enemyId)}
					{@const r = px(markerR(w.id) * 0.85)}
					<g class="sim-walker" transform="translate({(at.x + w.dx) * size.w} {(at.y + w.dy) * size.h})">
						<circle r={r + px(3)} fill="none" stroke="#f8fafc" stroke-width={px(2)} stroke-dasharray="{px(3)} {px(2)}" />
						{#if e?.icon}
							<image href={e.icon} x={-r} y={-r} width={r * 2} height={r * 2} clip-path="url(#clip-circle)" opacity="0.9" />
						{:else}
							<circle {r} fill="#94a3b8" />
						{/if}
					</g>
				{/each}
			{/each}

			<!-- Pull numbers -->
			{#each layers.on.pullNumbers ? pullLabels : [] as l (l.index)}
				{@const selected = editor.doc.pulls[l.index]?.id === editor.selectedPullId}
				{@const lr = (selected ? 11 : 9.5) * Math.min(markerScale, 1.3)}
				<g class="pull-label" transform="translate({l.x} {l.y - px(MARKER.trash * markerScale * 1.25 + lr + 4)})">
					<circle r={px(lr)} fill={l.color} stroke={selected ? '#fff' : '#0b0e14'} stroke-width={px(2)} />
					<text font-size={px(lr * (l.index >= 9 ? 0.95 : 1.1))} dy="0.36em">{l.index + 1}</text>
				</g>
			{/each}
		</g>
	</svg>

	<!-- Notes (HTML so text wraps nicely) -->
	{#each annotations as a (a.id)}
		{#if a.kind === 'note' && (layers.on.notes || noteDraft?.id === a.id)}
			{@const s = normToScreen(a.at)}
			{#if noteDraft?.id === a.id}
				<!-- being edited below -->			{:else if a.text}
				<button
					class="note"
					style="left:{s.x + 14}px; top:{s.y - 14}px"
					ondblclick={() => openNote(a.id, a.at, a.text)}
					oncontextmenu={(e) => contextMenu(e, { anno: a.id })}
					onclick={() => tool === 'erase' && editor.removeAnnotation(a.id)}
				>{a.text}</button>
			{/if}
		{/if}
	{/each}

	<!-- Teammates' cursors -->
	{#each layers.on.cursors ? cursors : [] as m (m.id)}
		{#if m.cursor && m.cursor.floor === floorId}
			{@const c = normToScreen(m.cursor)}
			<div class="cursor" style="transform: translate({c.x}px, {c.y}px); --c:{m.color}">
				<svg viewBox="0 0 16 16" width="18" height="18"><path d="M2 1.5 13.5 8 8 9.2 5.3 14.5z" fill={m.color} stroke="#0b0e14" stroke-width="1.2" stroke-linejoin="round" /></svg>
				<span>{m.name}</span>
			</div>
		{/if}
	{/each}

	{#if noteDraft}
		{@const s = normToScreen(noteDraft.at)}
		<div class="note editing" style="left:{s.x + 14}px; top:{s.y - 14}px">
			<textarea
				bind:value={noteText}
				use:focusInput
				rows="3"
				placeholder="Note… (Enter to save)"
				onblur={commitNote}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitNote(); }
					if (e.key === 'Escape') { e.stopPropagation(); noteDraft = null; }
				}}
			></textarea>
		</div>
	{/if}

	{#if dungeon.floors.length > 1}
		<div class="floors">
			{#each dungeon.floors as f, i}
				{@const c = floorCounts[f.id]}
				<button class:active={f.id === floorId} onclick={() => (floorId = f.id)} title="Floor {i + 1}">
					<span>{f.label}</span>
					{#if c?.total}<span class="floor-count" class:some={c.taken}>{c.taken}/{c.total}</span>{/if}
				</button>
			{/each}
		</div>
	{/if}

	<div class="legend-wrap">
		<div class="legend-btns">
			<button class="btn legend-btn" onclick={() => { showLegend = !showLegend; showLayers = false; }}>{showLegend ? 'Hide legend' : 'Legend'}</button>
			<button class="btn legend-btn" class:changed={layers.changed} aria-expanded={showLayers}
				onclick={() => { showLayers = !showLayers; showLegend = false; }} title="Show or hide map overlays">
				<svg class="layers-icon" viewBox="0 0 16 16" width="13" height="13"><path d="M8 2 1.5 5.5 8 9l6.5-3.5zM2 8.5 8 12l6-3.5M2 11 8 14.5l6-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg>
				Layers
			</button>
		</div>
		{#if showLayers}
			<div class="legend layers" role="group" aria-label="Map layers">
				{#each ['map', 'pulls'] as group}
					<div class="layer-group">{group === 'map' ? 'Map' : 'Pull list'}</div>
					{#each (Object.keys(LAYER_INFO) as Layer[]).filter((k) => LAYER_INFO[k].group === group) as k (k)}
						{@const info = LAYER_INFO[k]}
						<label class="layer">
							<input type="checkbox" checked={layers.on[k]} onchange={() => layers.toggle(k)} />
							<span>{info.label}</span>
							{#if 'key' in info}<kbd>{info.key}</kbd>{/if}
						</label>
					{/each}
				{/each}
				{#if layers.changed}<button class="reset" onclick={() => layers.reset()}>Reset to defaults</button>{/if}
			</div>
		{/if}
		{#if showLegend}
			<div class="legend">
				<div><span class="lg kick"></span>Has a kickable cast</div>
				<div><span class="lg immune"></span>Stun immune</div>
				<div><span class="lg emp">×3</span>Empowered (affix on)</div>
				<div><span class="lg start"></span>Dungeon start</div>
				<div><span class="lg cp"></span>Respawn checkpoint</div>
				<div><span class="lg mb"></span>Affix mini-boss</div>
				<div><span class="lg patrol"></span>Patrol path (arrow = direction)</div>
				{#if layers.on.effMap}<div><span class="lg effgrad"></span>Pack efficiency (green = best)</div>{/if}
				{#if dungeon.enemyPositions.some((s) => s.promoted)}<div><span class="lg promo"></span>Promoted (+1 difficulty)</div>{/if}
				<p>Badges appear when zoomed in. Show or hide any of these under <b>Layers</b>.</p>
			</div>
		{/if}
	</div>

	{#if layers.on.patrolSim && floorPatrols.length}
		<div class="simbar" role="group" aria-label="Patrol simulation">
			<button class="btn icon" onclick={simToggle} title={simPlaying ? 'Pause' : 'Play'} aria-label={simPlaying ? 'Pause' : 'Play'}>
				{#if simPlaying}
					<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" /></svg>
				{:else}
					<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
				{/if}
			</button>
			<span class="clock">{fmtClock(simTime)}</span>
			<input type="range" min="0" max="300" step="0.5" value={Math.min(simTime, 300)} oninput={(e) => (simTime = Number((e.currentTarget as HTMLInputElement).value))} aria-label="Time" />
			<select value={simRate} onchange={(e) => (simRate = Number((e.currentTarget as HTMLSelectElement).value))} aria-label="Playback speed">
				<option value={1}>1×</option>
				<option value={2}>2×</option>
				<option value={4}>4×</option>
			</select>
			<label title="Patrol walking speed in game units per second. Not in the game data we have: adjust it to match what you see in game.">
				Walk
				<select value={simSpeed} onchange={(e) => setSimSpeed(Number((e.currentTarget as HTMLSelectElement).value))}>
					{#each [150, 200, 250, 300, 350, 400] as v}<option value={v}>{v}</option>{/each}
				</select>
			</label>
			<button class="btn icon ghost" onclick={() => { simTime = 0; }} title="Back to the start" aria-label="Reset">↺</button>
		</div>
	{/if}

	<div class="zoom">
		<button class="btn icon" title="Zoom in" onclick={() => zoomAt({ x: viewW / 2, y: viewH / 2 }, 1.3)}>+</button>
		<button class="btn icon" title="Zoom out" onclick={() => zoomAt({ x: viewW / 2, y: viewH / 2 }, 0.77)}>−</button>
		<button class="btn icon" title="Fit map (F)" onclick={fit}>
			<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
		</button>
	</div>

	{#if tip}
		<div class="tooltip" style="left:{Math.min(mouse.x + 18, viewW - 290)}px; top:{Math.min(mouse.y + 18, viewH - 170)}px">
			<div class="tip-head">
				{#if tip.enemy.icon}<img src={tip.enemy.icon} alt="" />{/if}
				<div>
					<div class="tip-name">{tip.enemy.name}</div>
					<div class="tip-tags">
						{#if tip.enemy.type === 'boss'}<span class="tag boss">Boss</span>{/if}
						{#if tip.enemy.elite}<span class="tag elite">Elite</span>{/if}
						{#if tip.enemy.type === 'miniboss'}<span class="tag boss">Affix mini-boss</span>{/if}
						{#if tip.empowered}<span class="tag empowered">Empowered ×3</span>{/if}
						{#if tip.promoted}<span class="tag promoted" title="Capstone: +1 difficulty stats until the dungeon timer runs out">Promoted +1</span>{/if}
						{#if tip.patrol}<span class="tag patrol" title="Walks the dashed path on the map">Patrol{#if tip.patrol.spawns.length > 1} ×{tip.patrol.spawns.length}{/if}</span>{/if}
						{#if tip.enemy.stunImmune && tip.enemy.type === 'trash'}<span class="tag immune">Stun immune</span>{/if}
						{#if tip.chicken}<span class="tag chicken">Chickenized</span>{/if}
						<span class="tag" title="Health{editor.level ? ` at key level ${editor.level}` : ' at level 1'}{tip.enemy.healthMultiplier ? ` (×${tip.enemy.healthMultiplier.toFixed(2)} a normal enemy)` : ''}">{fmtHealth(editor.spawnHealth(hoverSpawn ?? ''))} HP</span>
					</div>
				</div>
				<div class="tip-score">
					<strong>{tip.score}</strong>
					<span>{fmtPct(editor.pct(tip.score))}</span>
				</div>
			</div>
			{#if tip.enemy.abilities.length}
				<div class="tip-abilities">
					{#each tip.enemy.abilities as a}
						<div class="ability">
							<span>{a.name}</span>
							{#if a.interruptible}<span class="tag kick">Kick</span>{:else if a.ccOnly}<span class="tag stun">Stun to stop</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#if tip.enemy.type === 'miniboss'}
				{@const info = affixById[tip.enemy.id.slice(3)]}
				{@const cleared = editor.minibossSpawns.find((m) => m.affix === info?.id)?.replaces.size ?? 0}
				{#if info?.timeBonus}<div class="tip-row">Defeat for +{info.timeBonus}s on the timer</div>{/if}
				{#if cleared}<div class="tip-row">Replaces {cleared} nearby enem{cleared === 1 ? 'y' : 'ies'} (hidden while it's active)</div>{/if}
			{/if}
			{#if tip.packCount > 1}
				{@const eff = ratings.of(editor.packOf(hoverSpawn ?? ''))}
				<div class="tip-row">Pack: {tip.packCount} enemies · {tip.packScore} score · {fmtPct(editor.pct(tip.packScore))} · {fmtHealth(editor.healthOf(editor.packOf(hoverSpawn ?? '')))} HP{#if eff !== null && layers.on.efficiency} · <span class="eff-{eff >= 1.15 ? 'good' : eff <= 0.85 ? 'poor' : 'avg'}">{eff.toFixed(1)}× efficiency</span>{/if}</div>
			{/if}
			<div class="tip-row">
				{#if tip.owner !== undefined}
					<span class="dot" style="background:{editor.doc.pulls[tip.owner].color}"></span> In pull {tip.owner + 1}
				{:else}
					<span class="muted">Not in a pull</span>
				{/if}
			</div>
			<div class="tip-hint">Click: {editor.selectedPull ? `toggle pack in pull ${editor.selectedIndex + 1}` : 'new pull from pack'} · Ctrl+click: single · Right-click: more</div>
		</div>
	{/if}

	{#if menu}
		<div class="menu" style="left:{menu.x}px; top:{menu.y}px" role="menu">
			{#if menu.spawn}
				{@const s = menu.spawn}
				{@const pack = editor.packOf(s)}
				{@const owner = editor.owner.get(s)}
				{@const sel = editor.selectedIndex}
				{#if sel >= 0}
					{@const inSel = pack.every((id) => editor.owner.get(id) === sel)}
					<button onclick={() => { editor.toggleSpawns(pack); menu = null; }}>
						{inSel ? `Remove pack from pull ${sel + 1}` : `Add pack to pull ${sel + 1}`}
					</button>
					<button onclick={() => { editor.toggleSpawns([s]); menu = null; }}>
						{owner === sel ? `Remove only this enemy` : `Add only this enemy to pull ${sel + 1}`}
					</button>
				{/if}
				<button onclick={() => { editor.newPullWith(pack); menu = null; }}>New pull from pack</button>
				{#if owner !== undefined}
					<button onclick={() => { editor.removeSpawns(pack); menu = null; }}>Remove pack from pull {owner + 1}</button>
				{/if}
				<hr />
				<button class="with-icon" onclick={() => { editor.toggleChicken(s); menu = null; }}>
					{#if chickenIcon}<img src={chickenIcon} alt="" />{/if}
					{editor.chickens.has(s) ? 'Undo Chickenize' : 'Chickenize (no kill score)'}
				</button>
			{:else if menu.anno}
				{@const a = editor.doc.annotations.find((x) => x.id === menu?.anno)}
				{#if a?.kind === 'note'}
					<button onclick={() => { openNote(a.id, a.at, a.text); menu = null; }}>Edit note</button>
				{/if}
				<button class="danger" onclick={() => { if (menu?.anno) editor.removeAnnotation(menu.anno); menu = null; }}>
					Delete {a?.kind === 'path' ? (a.arrow ? 'arrow' : 'drawing') : a?.kind}
				</button>
			{/if}
		</div>
	{/if}

	{#if !editor.doc.pulls.length && tool === 'select' && !twoStart}
		<div class="onboard">
			<strong>Start your route</strong>
			<span>Click any pack to create pull 1{#if dungeon.start}&nbsp;(start at the green flag){/if}. <kbd>?</kbd> shows every shortcut.</span>
		</div>
	{/if}

	{#if twoStart && !gesture}
		<div class="hint">Click the end point · Right-click to cancel</div>
	{/if}
</div>

<style>
	.map {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background:
			radial-gradient(ellipse at center, #1a2030 0%, #0b0e14 75%);
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		user-select: none;
		cursor: grab;
	}

	svg.panning {
		cursor: grabbing;
	}

	svg.tool-draw,
	svg.tool-arrow,
	svg.tool-stealth,
	svg.tool-portal,
	svg.tool-note {
		cursor: crosshair;
	}

	svg.tool-erase {
		cursor: not-allowed;
	}

	image.hidden {
		opacity: 0;
	}

	image {
		transition: opacity 0.25s;
	}

	.eff-good {
		color: #4ade80;
	}

	.eff-poor {
		color: #fca5a5;
	}

	.sim-walker {
		pointer-events: none;
	}

	.simbar {
		position: absolute;
		left: 50%;
		bottom: 12px;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: rgba(16, 20, 29, 0.94);
		font-size: 0.74rem;
		color: var(--text-muted);
		box-shadow: var(--shadow);
	}

	.simbar svg {
		width: 12px;
		height: 12px;
	}

	.simbar .clock {
		min-width: 34px;
		color: var(--text);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.simbar input[type='range'] {
		width: 160px;
		accent-color: var(--gold);
	}

	.simbar select {
		padding: 2px 4px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: var(--panel);
		color: var(--text);
		font: inherit;
	}

	.simbar label {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.patrol {
		pointer-events: none;
	}

	.tag.promoted {
		background: rgba(239, 68, 68, 0.15);
		color: #fca5a5;
	}

	.lg.effgrad {
		width: 22px;
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(90deg, hsl(0 75% 50%), hsl(60 75% 50%), hsl(125 75% 50%));
	}

	.lg.promo {
		border-radius: 0;
		border-top: 3px solid #ef4444;
		border-left: 3px solid #ef4444;
		transform: rotate(45deg) scale(0.6);
	}

	.tag.patrol {
		background: rgba(226, 232, 240, 0.12);
		color: #e2e8f0;
	}

	.lg.patrol {
		height: 0;
		border-radius: 0;
		border: none;
		border-top: 2px dashed #e2e8f0;
		background: none;
	}

	.halo {
		pointer-events: none;
	}

	.spawn {
		cursor: pointer;
		transition: opacity 0.15s;
	}

	svg:not(.tool-select) .spawn {
		cursor: inherit;
	}

	.spawn.faded {
		opacity: 0.38;
	}

	.spawn.dim {
		opacity: 0.28;
	}

	.pull-label {
		pointer-events: none;
	}

	.pull-label text,
	.note-glyph {
		fill: #fff;
		font-weight: 700;
		text-anchor: middle;
		font-family: var(--font);
	}

	.note-glyph {
		fill: #5b4214;
		font-style: italic;
		font-family: Georgia, serif;
	}

	.anno .hit {
		fill: none;
		stroke: transparent;
	}

	.anno {
		pointer-events: none;
	}

	.anno.erasable,
	.anno .hit {
		pointer-events: stroke;
	}

	.anno.erasable {
		cursor: pointer;
	}

	.anno.hovered {
		filter: drop-shadow(0 0 4px #ef4444);
		opacity: 0.7;
	}

	.floors {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		padding: 4px;
		background: rgba(16, 20, 29, 0.92);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		backdrop-filter: blur(6px);
	}

	.floors button {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		height: 30px;
		padding: 0 0.75rem;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
	}

	.floors button:hover {
		color: var(--text);
		background: var(--panel-hover);
	}

	.floors button.active {
		background: var(--panel-2);
		color: var(--gold-bright);
		box-shadow: inset 0 0 0 1px var(--gold-dim);
	}

	.floor-count {
		font-size: 0.7rem;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.floor-count.some {
		color: var(--gold);
	}

	.cursor {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
		z-index: 15;
		transition: transform 0.08s linear;
	}

	.cursor span {
		position: absolute;
		left: 14px;
		top: 14px;
		padding: 1px 7px;
		border-radius: 8px;
		background: var(--c);
		color: #0b0e14;
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
	}

	.glow {
		filter: drop-shadow(0 0 3px #facc15);
	}

	.badge-text {
		fill: #1b1408;
		font-weight: 800;
		text-anchor: middle;
		font-family: var(--font);
	}

	.poi {
		pointer-events: none;
	}

	.poi-label {
		fill: #4ade80;
		font-weight: 800;
		text-anchor: middle;
		letter-spacing: 0.08em;
		font-family: var(--font);
		paint-order: stroke;
		stroke: #052e16;
		stroke-width: 3px;
	}

	.tip-abilities {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.ability {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		color: var(--text);
	}

	.tag.kick {
		background: #1e3a8a;
		color: #bfdbfe;
	}

	.tag.stun {
		background: #3f3f46;
		color: #e4e4e7;
	}

	.tag.immune {
		background: #431407;
		color: #fdba74;
	}

	.tag.empowered {
		background: #422006;
		color: #fde047;
	}


	.legend-wrap {
		position: absolute;
		left: 12px;
		bottom: 12px;
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: 6px;
	}

	.legend-btns {
		display: flex;
		gap: 6px;
	}

	.layers-icon {
		width: 13px;
		height: 13px;
		flex: none;
	}

	.legend-btn.changed {
		border-color: var(--gold-dim);
		color: var(--gold-bright);
	}

	.legend.layers {
		min-width: 250px;
	}

	.layer-group {
		margin: 4px 0 2px;
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.layer-group:first-child {
		margin-top: 0;
	}

	.layer {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 2px;
		font-size: 0.78rem;
		cursor: pointer;
	}

	.layer input {
		accent-color: var(--gold);
		margin: 0;
	}

	.layer span {
		flex: 1;
	}

	.layer kbd {
		font-size: 0.65rem;
	}

	.reset {
		margin-top: 6px;
		padding: 4px 8px;
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		background: none;
		color: var(--text-muted);
		font-size: 0.72rem;
		cursor: pointer;
	}

	.reset:hover {
		color: var(--text);
	}

	.legend-btn {
		height: 28px;
		font-size: 0.75rem;
		background: rgba(26, 33, 48, 0.94);
	}

	.legend {
		padding: 10px 12px;
		background: rgba(16, 20, 29, 0.96);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 0.76rem;
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		gap: 6px;
		box-shadow: var(--shadow);
	}

	.legend div {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.legend p {
		margin: 2px 0 0;
		font-size: 0.7rem;
		color: var(--text-faint);
	}

	.lg {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		display: inline-grid;
		place-items: center;
		flex: none;
	}

	.lg.kick {
		background: #1d4ed8;
	}

	.lg.immune {
		background: #b45309;
	}

	.lg.emp {
		width: 20px;
		border-radius: 4px;
		background: #facc15;
		color: #1b1408;
		font-size: 0.6rem;
		font-weight: 800;
	}

	.lg.start {
		background: #22c55e;
	}

	.lg.cp {
		background: #f59e0b;
		border-radius: 2px;
		transform: rotate(45deg) scale(0.8);
	}

	.lg.mb {
		border: 2px dashed #7dd3fc;
	}

	.zoom {
		position: absolute;
		right: 12px;
		bottom: 12px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.zoom .btn {
		background: rgba(26, 33, 48, 0.94);
		font-size: 1.05rem;
	}

	.tooltip {
		position: absolute;
		width: 280px;
		padding: 10px 12px;
		background: rgba(16, 20, 29, 0.97);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: var(--shadow);
		pointer-events: none;
		z-index: 20;
		font-size: 0.8rem;
	}

	.tip-head {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.tip-head img {
		width: 44px;
		height: 44px;
		border-radius: 8px;
		border: 1px solid var(--border-strong);
	}

	.tip-head > div:nth-child(2) {
		flex: 1;
		min-width: 0;
	}

	.tip-name {
		font-weight: 600;
		font-size: 0.92rem;
	}

	.tip-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 3px;
	}

	.tag {
		font-size: 0.66rem;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--panel-hover);
		color: var(--text-muted);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.tag.boss {
		background: #3b2a0c;
		color: var(--gold-bright);
	}

	.tag.elite {
		background: #2b2310;
		color: var(--gold);
	}

	.tag.chicken {
		background: #3a1d0b;
		color: #fdba74;
	}

	.tip-score {
		text-align: right;
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}

	.tip-score strong {
		font-size: 1.15rem;
		color: var(--gold-bright);
	}

	.tip-score span {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.tip-row {
		margin-top: 8px;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
	}

	.muted {
		color: var(--text-faint);
	}

	.tip-hint {
		margin-top: 8px;
		padding-top: 7px;
		border-top: 1px solid var(--border);
		font-size: 0.7rem;
		color: var(--text-faint);
	}

	.menu {
		position: absolute;
		min-width: 220px;
		padding: 5px;
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: var(--shadow);
		z-index: 30;
		display: flex;
		flex-direction: column;
	}

	.menu button {
		display: flex;
		align-items: center;
		gap: 8px;
		text-align: left;
		padding: 7px 10px;
		border: none;
		background: none;
		border-radius: 6px;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.menu button:hover {
		background: var(--panel-hover);
	}

	.menu button.danger:hover {
		color: #fca5a5;
	}

	.menu img {
		width: 18px;
		height: 18px;
		border-radius: 4px;
	}

	.menu hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 4px 2px;
	}

	.note {
		position: absolute;
		max-width: 220px;
		padding: 6px 9px;
		background: #f8e7b5;
		color: #2b1d05;
		border: 1px solid #b38b3e;
		border-radius: 6px;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
		font-size: 0.8rem;
		line-height: 1.35;
		text-align: left;
		white-space: pre-wrap;
		cursor: text;
		z-index: 5;
	}

	.note.editing {
		padding: 0;
	}

	.note textarea {
		width: 220px;
		border: none;
		background: transparent;
		color: inherit;
		padding: 6px 9px;
		resize: none;
		outline: none;
	}

	.onboard {
		position: absolute;
		top: 58px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 9px 16px;
		background: rgba(16, 20, 29, 0.94);
		border: 1px solid var(--gold-dim);
		border-radius: 10px;
		box-shadow: var(--shadow);
		font-size: 0.8rem;
		color: var(--text-muted);
		pointer-events: none;
		text-align: center;
		z-index: 9;
	}

	.onboard strong {
		color: var(--gold-bright);
		font-size: 0.88rem;
	}

	.hint {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		padding: 6px 12px;
		background: rgba(16, 20, 29, 0.94);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 0.78rem;
		color: var(--text-muted);
		pointer-events: none;
	}
</style>
