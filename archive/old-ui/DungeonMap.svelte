<script lang="ts">
	import type { Dungeon, Pull, EnemyPosition, Enemy } from '$lib/types';
	import {
		loadCustomMapImage,
		saveCustomMapImage,
		clearCustomMapImage,
		mapImageCandidates
	} from '$lib/stores/mapStore';

	interface Props {
		dungeon: Dungeon;
		pulls: Pull[];
		selectedPullId: string | null;
		spawns: EnemyPosition[];
		usingPlaceholderSpawns: boolean;
		onToggleSpawns?: (spawnIds: string[]) => void;
		onSpawnsChange?: (spawns: EnemyPosition[]) => void;
		onResetSpawns?: () => void;
	}

	let {
		dungeon,
		pulls,
		selectedPullId,
		spawns,
		usingPlaceholderSpawns,
		onToggleSpawns,
		onSpawnsChange,
		onResetSpawns
	}: Props = $props();

	type Point = { x: number; y: number };
	type Mode = 'plan' | 'draw' | 'edit';

	const DEFAULT_SIZE = { width: 1600, height: 1000 };
	const MARKER_PX = 11;
	const DRAG_THRESHOLD = 4;

	let svg: SVGSVGElement;
	let viewWidth = $state(0);
	let viewHeight = $state(0);

	let mode = $state<Mode>('plan');
	let zoom = $state(1);
	let pan = $state<Point>({ x: 0, y: 0 });
	let hasFitted = false;

	// Floors: multi-level dungeons have one map image per area.
	let floorId = $state(dungeon.floors[0]?.id ?? 'f1');
	let floor = $derived(dungeon.floors.find((f) => f.id === floorId));
	let floorSpawns = $derived(
		spawns.filter((s) => (s.floor ?? dungeon.floors[0]?.id ?? 'f1') === floorId)
	);

	// Map image: a user-uploaded image wins over the bundled static/maps file.
	let customImageUrl = $state<string | null>(null);
	let candidateIndex = $state(0);
	let bundledFailed = $state(false);
	let imageSize = $state(dungeon.mapDimensions ?? DEFAULT_SIZE);
	let imageLoaded = $state(false);
	let candidates = $derived(mapImageCandidates(dungeon, floor));
	let imageUrl = $derived(
		customImageUrl ?? (bundledFailed ? null : candidates[candidateIndex] ?? null)
	);

	let hoveredSpawnId = $state<string | null>(null);
	let hoverScreen = $state<Point>({ x: 0, y: 0 });

	// Path drawing (normalized coordinates)
	let paths = $state<Point[][]>([]);
	let currentPath = $state<Point[]>([]);

	// Spawn editor
	let editEnemyId = $state(dungeon.enemies[0]?.id ?? '');
	let editPack = $state(1);
	let editSelectedId = $state<string | null>(null);
	let exportText = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	// Pointer gesture bookkeeping
	let gesture = $state<{
		kind: 'background' | 'spawn' | 'draw';
		start: Point;
		last: Point;
		moved: boolean;
		spawnId?: string;
		modifier: boolean;
	} | null>(null);

	let enemyById = $derived(new Map(dungeon.enemies.map((e) => [e.id, e])));
	let markerR = $derived(MARKER_PX / zoom);

	let pullIndexBySpawn = $derived.by(() => {
		const map = new Map<string, number>();
		pulls.forEach((pull, i) => pull.spawns?.forEach((id) => map.set(id, i)));
		return map;
	});

	let packs = $derived.by(() => {
		const groups = new Map<number, EnemyPosition[]>();
		for (const s of floorSpawns) {
			if (s.pack == null) continue;
			const list = groups.get(s.pack) ?? [];
			list.push(s);
			groups.set(s.pack, list);
		}
		return [...groups.entries()].map(([pack, members]) => {
			const cx = members.reduce((t, s) => t + s.x * imageSize.width, 0) / members.length;
			const cy = members.reduce((t, s) => t + s.y * imageSize.height, 0) / members.length;
			const spread = Math.max(
				...members.map((s) => Math.hypot(s.x * imageSize.width - cx, s.y * imageSize.height - cy))
			);
			const pullIdxs = new Set(members.map((s) => pullIndexBySpawn.get(s.id)));
			const pullIdx = pullIdxs.size === 1 ? [...pullIdxs][0] : undefined;
			return { pack, members, cx, cy, spread, pullIdx };
		});
	});

	let hoveredSpawn = $derived(floorSpawns.find((s) => s.id === hoveredSpawnId) ?? null);
	let hoveredEnemy = $derived<Enemy | undefined>(
		hoveredSpawn ? enemyById.get(hoveredSpawn.enemyId) : undefined
	);

	let packScore = $derived.by(() => {
		if (!hoveredSpawn || hoveredSpawn.pack == null) return null;
		const members = spawns.filter((s) => s.pack === hoveredSpawn.pack);
		return {
			count: members.length,
			score: members.reduce((t, s) => t + (enemyById.get(s.enemyId)?.score ?? 0), 0)
		};
	});

	// --- image loading -------------------------------------------------------

	// Uploaded images are stored per floor.
	let imageKey = $derived(dungeon.floors.length > 1 ? `${dungeon.id}:${floorId}` : dungeon.id);

	$effect(() => {
		let url: string | null = null;
		let cancelled = false;
		customImageUrl = null;
		candidateIndex = 0;
		bundledFailed = false;
		loadCustomMapImage(imageKey).then((blob) => {
			if (cancelled || !blob) return;
			url = URL.createObjectURL(blob);
			customImageUrl = url;
		});
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
		};
	});

	// Probe the URL with an Image so we learn its natural size before rendering.
	$effect(() => {
		const url = imageUrl;
		if (!url) {
			imageLoaded = false;
			fitToView();
			return;
		}
		const img = new Image();
		img.onload = () => {
			if (imageUrl !== url) return;
			imageSize = { width: img.naturalWidth, height: img.naturalHeight };
			imageLoaded = true;
			hasFitted = false;
			fitToView();
		};
		img.onerror = () => {
			if (imageUrl !== url) return;
			imageLoaded = false;
			if (url === customImageUrl) {
				customImageUrl = null;
			} else if (candidateIndex < candidates.length - 1) {
				candidateIndex++;
			} else {
				bundledFailed = true;
			}
		};
		img.src = url;
	});

	$effect(() => {
		// Fit once the container has a size.
		if (viewWidth > 0 && viewHeight > 0 && !hasFitted) fitToView();
	});

	async function handleImageUpload(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		await saveCustomMapImage(imageKey, file);
		if (customImageUrl) URL.revokeObjectURL(customImageUrl);
		customImageUrl = URL.createObjectURL(file);
		fileInput.value = '';
	}

	async function removeCustomImage() {
		await clearCustomMapImage(imageKey);
		if (customImageUrl) URL.revokeObjectURL(customImageUrl);
		customImageUrl = null;
		candidateIndex = 0;
		bundledFailed = false;
	}

	// --- view transform ------------------------------------------------------

	function fitToView() {
		if (viewWidth === 0 || viewHeight === 0) return;
		const z = Math.min(viewWidth / imageSize.width, viewHeight / imageSize.height) * 0.95;
		zoom = z;
		pan = {
			x: (viewWidth - imageSize.width * z) / 2,
			y: (viewHeight - imageSize.height * z) / 2
		};
		hasFitted = true;
	}

	function fitZoom() {
		return Math.min(viewWidth / imageSize.width, viewHeight / imageSize.height) || 1;
	}

	function zoomAt(screen: Point, factor: number) {
		const base = fitZoom();
		const next = Math.max(base * 0.5, Math.min(base * 10, zoom * factor));
		pan = {
			x: screen.x - (screen.x - pan.x) * (next / zoom),
			y: screen.y - (screen.y - pan.y) * (next / zoom)
		};
		zoom = next;
	}

	function screenPoint(e: MouseEvent): Point {
		const rect = svg.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function toNormalized(screen: Point): Point {
		return {
			x: (screen.x - pan.x) / zoom / imageSize.width,
			y: (screen.y - pan.y) / zoom / imageSize.height
		};
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		zoomAt(screenPoint(e), e.deltaY > 0 ? 0.9 : 1.1);
	}

	// --- pointer handling ----------------------------------------------------

	function beginGesture(e: PointerEvent, kind: 'background' | 'spawn', spawnId?: string) {
		if (e.button === 2) return;
		const p = screenPoint(e);
		svg.setPointerCapture(e.pointerId);
		const drawing = kind === 'background' && mode === 'draw' && e.button === 0 && !e.shiftKey;
		gesture = {
			kind: drawing ? 'draw' : kind,
			start: p,
			last: p,
			moved: false,
			spawnId,
			modifier: e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
		};
		if (drawing) currentPath = [toNormalized(p)];
		e.stopPropagation();
	}

	function handlePointerMove(e: PointerEvent) {
		const p = screenPoint(e);
		if (!gesture) {
			hoverScreen = p;
			return;
		}
		if (!gesture.moved && Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > DRAG_THRESHOLD) {
			gesture.moved = true;
		}
		if (!gesture.moved) return;

		if (gesture.kind === 'draw') {
			currentPath.push(toNormalized(p));
		} else if (gesture.kind === 'spawn' && mode === 'edit' && gesture.spawnId) {
			const n = toNormalized(p);
			const id = gesture.spawnId;
			onSpawnsChange?.(
				spawns.map((s) => (s.id === id ? { ...s, x: clamp01(n.x), y: clamp01(n.y) } : s))
			);
		} else {
			pan = { x: pan.x + p.x - gesture.last.x, y: pan.y + p.y - gesture.last.y };
		}
		gesture.last = p;
	}

	function handlePointerUp(e: PointerEvent) {
		const g = gesture;
		gesture = null;
		if (!g) return;
		if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);

		if (g.kind === 'draw') {
			if (currentPath.length > 1) paths.push(currentPath);
			currentPath = [];
			return;
		}
		if (g.moved) return;

		if (g.kind === 'spawn' && g.spawnId) {
			if (mode === 'edit') {
				if (g.modifier) assignToEditPack(g.spawnId);
				else editSelectedId = g.spawnId;
			} else {
				toggleSpawn(g.spawnId, g.modifier);
			}
		} else if (g.kind === 'background' && mode === 'edit') {
			placeSpawn(toNormalized(g.start));
		} else if (g.kind === 'background') {
			editSelectedId = null;
		}
	}

	function handleContextMenu(e: MouseEvent, spawnId?: string) {
		e.preventDefault();
		if (mode === 'edit' && spawnId) removeSpawn(spawnId);
	}

	function toggleSpawn(spawnId: string, single: boolean) {
		const spawn = spawns.find((s) => s.id === spawnId);
		if (!spawn) return;
		const ids =
			single || spawn.pack == null
				? [spawnId]
				: spawns.filter((s) => s.pack === spawn.pack).map((s) => s.id);
		onToggleSpawns?.(ids);
	}

	// --- spawn editor --------------------------------------------------------

	function clamp01(v: number) {
		return Math.max(0, Math.min(1, v));
	}

	function round(v: number) {
		return Math.round(v * 10000) / 10000;
	}

	function nextSpawnId(): string {
		const prefix = `${dungeon.slug}-`;
		const max = spawns.reduce((m, s) => {
			const n = s.id.startsWith(prefix) ? Number(s.id.slice(prefix.length)) : NaN;
			return Number.isFinite(n) ? Math.max(m, n) : m;
		}, 0);
		return `${prefix}${max + 1}`;
	}

	function placeSpawn(n: Point) {
		if (!editEnemyId || n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;
		const spawn: EnemyPosition = {
			id: nextSpawnId(),
			enemyId: editEnemyId,
			x: round(n.x),
			y: round(n.y),
			pack: editPack,
			floor: floorId
		};
		onSpawnsChange?.([...spawns, spawn]);
		editSelectedId = spawn.id;
	}

	function removeSpawn(spawnId: string) {
		onSpawnsChange?.(spawns.filter((s) => s.id !== spawnId));
		if (editSelectedId === spawnId) editSelectedId = null;
	}

	function assignToEditPack(spawnId: string) {
		onSpawnsChange?.(spawns.map((s) => (s.id === spawnId ? { ...s, pack: editPack } : s)));
	}

	function newPack() {
		editPack = spawns.reduce((m, s) => Math.max(m, s.pack ?? 0), 0) + 1;
	}

	function clearAllSpawns() {
		if (!confirm('Remove every spawn from this map?')) return;
		onSpawnsChange?.([]);
		editPack = 1;
	}

	function resetSpawns() {
		if (!confirm('Discard your local spawn edits and restore the built-in layout?')) return;
		onResetSpawns?.();
	}

	function exportSpawns() {
		const lines = spawns.map(
			(s) =>
				`\t\t{ id: '${s.id}', enemyId: '${s.enemyId}', x: ${round(s.x)}, y: ${round(s.y)}` +
				(s.pack != null ? `, pack: ${s.pack}` : '') +
				(s.floor ? `, floor: '${s.floor}'` : '') +
				' }'
		);
		exportText = `\tenemyPositions: [\n${lines.join(',\n')}\n\t],`;
		navigator.clipboard?.writeText(exportText).catch(() => {});
	}

	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select')) return;
		if (mode === 'edit' && editSelectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
			removeSpawn(editSelectedId);
			e.preventDefault();
		} else if (e.key === 'Escape' && mode !== 'plan') {
			mode = 'plan';
		}
	}

	function setMode(next: Mode) {
		mode = mode === next ? 'plan' : next;
		editSelectedId = null;
		exportText = null;
	}

	// --- rendering helpers ---------------------------------------------------

	function spawnFill(spawnId: string): string {
		const idx = pullIndexBySpawn.get(spawnId);
		if (idx !== undefined) return pulls[idx].color ?? '#667eea';
		return '#64748b';
	}

	function pathD(points: Point[]): string {
		return points
			.map((p, i) => `${i ? 'L' : 'M'}${p.x * imageSize.width},${p.y * imageSize.height}`)
			.join(' ');
	}

	function arrowHead(points: Point[]): string {
		const a = points[points.length - 2];
		const b = points[points.length - 1];
		const ax = a.x * imageSize.width, ay = a.y * imageSize.height;
		const bx = b.x * imageSize.width, by = b.y * imageSize.height;
		const angle = Math.atan2(by - ay, bx - ax);
		const len = 14 / zoom, w = 7 / zoom;
		const p1 = `${bx - len * Math.cos(angle) + w * Math.sin(angle)},${by - len * Math.sin(angle) - w * Math.cos(angle)}`;
		const p2 = `${bx - len * Math.cos(angle) - w * Math.sin(angle)},${by - len * Math.sin(angle) + w * Math.cos(angle)}`;
		return `${bx},${by} ${p1} ${p2}`;
	}

	let selectablePullNumber = $derived(
		selectedPullId ? pulls.findIndex((p) => p.id === selectedPullId) + 1 : null
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="map-wrapper" bind:clientWidth={viewWidth} bind:clientHeight={viewHeight}>
	<svg
		bind:this={svg}
		class:mode-edit={mode === 'edit'}
		class:mode-draw={mode === 'draw'}
		class:panning={gesture?.moved && gesture.kind === 'background'}
		role="application"
		aria-label="{dungeon.name} map"
		onpointerdown={(e) => beginGesture(e, 'background')}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointerleave={() => (hoveredSpawnId = null)}
		onwheel={handleWheel}
		oncontextmenu={(e) => handleContextMenu(e)}
	>
		<defs>
			<pattern id="map-grid" width="50" height="50" patternUnits="userSpaceOnUse">
				<path d="M50 0H0V50" fill="none" stroke="#1e293b" stroke-width="1" />
			</pattern>
		</defs>

		<g transform="translate({pan.x} {pan.y}) scale({zoom})">
			{#if imageUrl && imageLoaded}
				<image
					href={imageUrl}
					width={imageSize.width}
					height={imageSize.height}
					preserveAspectRatio="none"
				/>
			{:else}
				<rect width={imageSize.width} height={imageSize.height} fill="#0d1322" />
				<rect width={imageSize.width} height={imageSize.height} fill="url(#map-grid)" />
			{/if}
			<rect
				width={imageSize.width}
				height={imageSize.height}
				fill="none"
				stroke="#334155"
				stroke-width={2 / zoom}
			/>

			<!-- Pack outlines -->
			{#each packs as p (p.pack)}
				{@const color = p.pullIdx !== undefined ? (pulls[p.pullIdx].color ?? '#667eea') : '#94a3b8'}
				<circle
					cx={p.cx}
					cy={p.cy}
					r={p.spread + markerR * 1.8}
					fill={color}
					fill-opacity={p.pullIdx !== undefined ? 0.18 : 0.06}
					stroke={color}
					stroke-opacity="0.6"
					stroke-width={1.5 / zoom}
					stroke-dasharray={p.pullIdx !== undefined ? 'none' : `${4 / zoom} ${4 / zoom}`}
					class="pack-outline"
				/>
				{#if p.pullIdx !== undefined}
					<g transform="translate({p.cx} {p.cy - p.spread - markerR * 1.8})">
						<circle r={10 / zoom} fill={color} stroke="#0a0e1a" stroke-width={2 / zoom} />
						<text class="pull-number" font-size={11 / zoom} dy="0.35em">{p.pullIdx + 1}</text>
					</g>
				{/if}
			{/each}

			<!-- Drawn paths -->
			{#each paths as path}
				<path d={pathD(path)} class="route-path" stroke-width={3 / zoom} />
				<polygon points={arrowHead(path)} fill="#667eea" />
			{/each}
			{#if currentPath.length > 1}
				<path d={pathD(currentPath)} class="route-path drawing" stroke-width={3 / zoom} />
			{/if}

			<!-- Spawns -->
			{#each floorSpawns as spawn (spawn.id)}
				{@const enemy = enemyById.get(spawn.enemyId)}
				{@const isBoss = enemy?.type === 'boss' || enemy?.type === 'miniboss'}
				{@const r = isBoss ? markerR * 1.6 : markerR}
				{@const hovered = hoveredSpawnId === spawn.id}
				<g
					class="spawn"
					class:selected={editSelectedId === spawn.id}
					transform="translate({spawn.x * imageSize.width} {spawn.y * imageSize.height})"
					role="button"
					tabindex="-1"
					aria-label={enemy?.name ?? spawn.enemyId}
					onpointerdown={(e) => beginGesture(e, 'spawn', spawn.id)}
					onpointerenter={() => (hoveredSpawnId = spawn.id)}
					onpointerleave={() => (hoveredSpawnId = null)}
					oncontextmenu={(e) => {
						e.stopPropagation();
						handleContextMenu(e, spawn.id);
					}}
				>
					<circle
						r={hovered ? r * 1.25 : r}
						fill={spawnFill(spawn.id)}
						stroke={editSelectedId === spawn.id ? '#facc15' : hovered ? '#fff' : '#0a0e1a'}
						stroke-width={(hovered || editSelectedId === spawn.id ? 2.5 : 1.5) / zoom}
					/>
					<text font-size={(isBoss ? 13 : 10) / zoom} dy="0.35em">
						{isBoss ? '★' : (enemy?.score ?? '?')}
					</text>
					{#if enemy?.ccImmune}
						<circle cx={r * 0.75} cy={-r * 0.75} r={3.5 / zoom} fill="#ef4444" />
					{/if}
				</g>
			{/each}
		</g>
	</svg>

	{#if !imageLoaded}
		<div class="no-map">
			<strong>No map image for {dungeon.name}{floor && dungeon.floors.length > 1 ? ` (${floor.label})` : ''} yet</strong>
			<span>
				Add <code>static{candidates[0]}</code>, or upload one from
				<button class="link" onclick={() => fileInput.click()}>your computer</button>.
			</span>
		</div>
	{/if}

	{#if hoveredSpawn && hoveredEnemy && !gesture}
		<div
			class="tooltip"
			style="left: {Math.min(hoverScreen.x + 16, viewWidth - 280)}px; top: {Math.min(hoverScreen.y + 16, viewHeight - 160)}px"
		>
			<div class="tooltip-header">
				<span class="tooltip-name">{hoveredEnemy.name}</span>
				<span class="tooltip-score">{hoveredEnemy.score}</span>
			</div>
			<div class="tooltip-tags">
				{#if hoveredEnemy.stunnable}<span class="tag stun">Stunnable</span>{/if}
				{#if hoveredEnemy.ccImmune}<span class="tag immune">CC Immune</span>{/if}
				{#if packScore}<span class="tag pack">Pack {hoveredSpawn.pack}: {packScore.count} mobs · {packScore.score} score</span>{/if}
			</div>
			{#each hoveredEnemy.abilities as ability}
				<div class="tooltip-ability">
					<span>{ability.name}</span>
					{#if ability.interruptible}<span class="tag int">Int</span>{/if}
					{#if ability.priority === 'high'}<span class="tag prio">!</span>{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if dungeon.floors.length > 1}
		<div class="floor-tabs" class:shifted={mode === 'edit'}>
			{#each dungeon.floors as f}
				{@const assigned = spawns.filter((s) => s.floor === f.id && pullIndexBySpawn.has(s.id)).length}
				<button class:active={f.id === floorId} onclick={() => (floorId = f.id)}>
					{f.label}
					{#if assigned}<span class="floor-count">{assigned}</span>{/if}
				</button>
			{/each}
		</div>
	{/if}

	<div class="map-controls">
		<div class="mode-switch">
			<button class:active={mode === 'plan'} onclick={() => (mode = 'plan')}>Plan</button>
			<button class:active={mode === 'draw'} onclick={() => setMode('draw')}>Draw</button>
			<button class:active={mode === 'edit'} onclick={() => setMode('edit')}>Edit spawns</button>
		</div>
		<div class="control-row">
			<button onclick={() => zoomAt({ x: viewWidth / 2, y: viewHeight / 2 }, 1.25)} title="Zoom in">+</button>
			<button onclick={() => zoomAt({ x: viewWidth / 2, y: viewHeight / 2 }, 0.8)} title="Zoom out">−</button>
			<button onclick={fitToView} title="Fit map to view">Fit</button>
			<span class="zoom-level">{Math.round((zoom / fitZoom()) * 100)}%</span>
		</div>
		{#if mode === 'draw'}
			<div class="control-row">
				<button onclick={() => paths.pop()} disabled={paths.length === 0}>↶ Undo</button>
				<button onclick={() => (paths = [])} disabled={paths.length === 0}>Clear paths</button>
			</div>
		{/if}
		<div class="map-legend">
			<div class="legend-item"><span class="legend-dot" style="background:#64748b"></span>Unassigned</div>
			<div class="legend-item"><span class="legend-dot" style="background:#667eea"></span>In pull</div>
			<div class="legend-item"><span class="legend-dot small" style="background:#ef4444"></span>CC immune</div>
			<div class="legend-item"><span class="legend-star">★</span>Boss</div>
		</div>
	</div>

	{#if mode === 'edit'}
		<div class="editor-panel">
			<h4>Spawn editor</h4>
			<label>
				Enemy
				<select bind:value={editEnemyId}>
					{#each dungeon.enemies as enemy}
						<option value={enemy.id}>{enemy.name} ({enemy.type === 'trash' ? enemy.score : enemy.type})</option>
					{/each}
				</select>
			</label>
			<div class="pack-row">
				<label>
					Pack
					<input type="number" min="1" bind:value={editPack} />
				</label>
				<button onclick={newPack}>New pack</button>
			</div>
			<ul class="editor-help">
				<li>Click map: place enemy in pack {editPack}</li>
				<li>Drag a spawn: move it</li>
				<li>Shift+click spawn: move to pack {editPack}</li>
				<li>Right-click / Del: remove</li>
			</ul>
			{#if usingPlaceholderSpawns}
				<p class="editor-warn">Showing placeholder spawns. Clear them before placing real ones.</p>
			{/if}
			<div class="editor-actions">
				<button onclick={exportSpawns}>Copy spawn data</button>
				<button onclick={clearAllSpawns}>Clear all</button>
				<button onclick={resetSpawns}>Reset to built-in</button>
			</div>
			<div class="editor-actions">
				<button onclick={() => fileInput.click()}>Upload map image</button>
				{#if customImageUrl}
					<button onclick={removeCustomImage}>Remove uploaded image</button>
				{/if}
			</div>
			{#if exportText}
				<p class="editor-note">Copied. Paste into <code>src/lib/data/{dungeon.slug}.ts</code>:</p>
				<textarea readonly rows="6" value={exportText} onfocus={(e) => e.currentTarget.select()}></textarea>
			{/if}
		</div>
	{/if}

	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		hidden
		onchange={handleImageUpload}
	/>

	<div class="map-hint">
		{#if mode === 'edit'}
			Editing spawns. Esc to exit
		{:else if mode === 'draw'}
			Drag to draw a path • Shift+drag to pan • Esc to exit
		{:else if selectablePullNumber}
			Click packs to add/remove from pull {selectablePullNumber} • Ctrl+click for a single mob • Drag to pan
		{:else}
			Click a pack to start a new pull • Ctrl+click for a single mob • Drag to pan • Scroll to zoom
		{/if}
	</div>
</div>

<style>
	.map-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #0a0e1a;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}

	svg.panning {
		cursor: grabbing;
	}

	svg.mode-edit,
	svg.mode-draw {
		cursor: crosshair;
	}

	.spawn {
		cursor: pointer;
	}

	svg.mode-edit .spawn {
		cursor: move;
	}

	.spawn text,
	.pull-number {
		fill: #fff;
		font-weight: 700;
		text-anchor: middle;
		pointer-events: none;
		font-family: system-ui, sans-serif;
	}

	.pack-outline {
		pointer-events: none;
	}

	.route-path {
		fill: none;
		stroke: #667eea;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}

	.route-path.drawing {
		stroke: #f093fb;
	}

	.no-map {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: center;
		text-align: center;
		background: rgba(30, 41, 59, 0.95);
		border: 1px dashed #475569;
		border-radius: 8px;
		padding: 0.75rem 1.25rem;
		font-size: 0.8rem;
		color: #94a3b8;
		max-width: min(480px, 80%);
	}

	.no-map strong {
		color: #e5e7eb;
		font-size: 0.9rem;
	}

	code {
		background: #0f172a;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		color: #c4b5fd;
	}

	.link {
		background: none;
		border: none;
		color: #a5b4fc;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		font: inherit;
	}

	.tooltip {
		position: absolute;
		width: 260px;
		background: rgba(15, 23, 42, 0.97);
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
		font-size: 0.75rem;
		color: #cbd5e1;
		pointer-events: none;
		z-index: 20;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
	}

	.tooltip-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.35rem;
	}

	.tooltip-name {
		font-weight: 700;
		color: #f1f5f9;
		font-size: 0.85rem;
	}

	.tooltip-score {
		font-weight: 700;
		color: #a5b4fc;
	}

	.tooltip-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.35rem;
	}

	.tooltip-ability {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.1rem 0;
	}

	.tag {
		font-size: 0.65rem;
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
		font-weight: 600;
	}

	.tag.stun { background: #1e3a8a; color: #bfdbfe; }
	.tag.immune { background: #7f1d1d; color: #fecaca; }
	.tag.pack { background: #334155; color: #e2e8f0; }
	.tag.int { background: #14532d; color: #bbf7d0; }
	.tag.prio { background: #9a3412; color: #fed7aa; }

	.floor-tabs {
		position: absolute;
		top: 1rem;
		left: 1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		z-index: 10;
		max-width: calc(100% - 22rem);
	}

	.floor-tabs.shifted {
		left: calc(250px + 2rem);
	}

	.floor-tabs button {
		background: rgba(30, 41, 59, 0.95);
		border: 1px solid #334155;
		color: #e5e7eb;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.floor-tabs button.active {
		background: #667eea;
		border-color: #667eea;
		color: #fff;
	}

	.floor-count {
		background: rgba(15, 23, 42, 0.6);
		border-radius: 999px;
		padding: 0 0.4rem;
		font-size: 0.7rem;
	}

	.map-controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-end;
		z-index: 10;
	}

	.mode-switch,
	.control-row {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.map-controls button,
	.editor-panel button {
		background: rgba(30, 41, 59, 0.95);
		border: 1px solid #334155;
		color: #e5e7eb;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		transition: border-color 0.15s, background 0.15s;
	}

	.map-controls button:hover:not(:disabled),
	.editor-panel button:hover {
		border-color: #667eea;
	}

	.map-controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.map-controls button.active {
		background: #667eea;
		border-color: #667eea;
		color: #fff;
	}

	.zoom-level {
		background: rgba(30, 41, 59, 0.95);
		border: 1px solid #334155;
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		font-size: 0.75rem;
		color: #94a3b8;
		min-width: 3rem;
		text-align: center;
	}

	.map-legend {
		background: rgba(30, 41, 59, 0.95);
		border: 1px solid #334155;
		padding: 0.6rem 0.75rem;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #e5e7eb;
	}

	.legend-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid #0a0e1a;
	}

	.legend-dot.small {
		width: 8px;
		height: 8px;
		margin: 0 3px;
		border: none;
	}

	.legend-star {
		width: 14px;
		text-align: center;
		color: #facc15;
	}

	.editor-panel {
		position: absolute;
		top: 1rem;
		left: 1rem;
		width: 250px;
		background: rgba(15, 23, 42, 0.97);
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 0.75rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		font-size: 0.8rem;
		color: #cbd5e1;
		max-height: calc(100% - 5rem);
		overflow-y: auto;
	}

	.editor-panel h4 {
		margin: 0;
		color: #f1f5f9;
	}

	.editor-panel label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #94a3b8;
	}

	.editor-panel select,
	.editor-panel input,
	.editor-panel textarea {
		background: #0f172a;
		border: 1px solid #334155;
		color: #e5e7eb;
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		text-transform: none;
		letter-spacing: normal;
	}

	.editor-panel textarea {
		font-family: ui-monospace, monospace;
		font-size: 0.7rem;
		resize: vertical;
	}

	.pack-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.pack-row label {
		flex: 1;
	}

	.editor-help {
		margin: 0;
		padding-left: 1rem;
		font-size: 0.72rem;
		color: #94a3b8;
		line-height: 1.5;
	}

	.editor-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.editor-warn {
		margin: 0;
		font-size: 0.72rem;
		color: #fbbf24;
	}

	.editor-note {
		margin: 0;
		font-size: 0.72rem;
	}

	.map-hint {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(30, 41, 59, 0.95);
		border: 1px solid #334155;
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
		font-size: 0.75rem;
		color: #94a3b8;
		pointer-events: none;
		white-space: nowrap;
	}
</style>
