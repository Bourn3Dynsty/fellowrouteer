<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import type { PageData } from './$types';
	import MapView, { type Tool } from '$lib/components/planner/MapView.svelte';
	import PullList from '$lib/components/planner/PullList.svelte';
	import SidePanel from '$lib/components/planner/SidePanel.svelte';
	import AffixBar from '$lib/components/planner/AffixBar.svelte';
	import { RouteEditor } from '$lib/route/editor.svelte';
	import { newRoute, encodeRoute, decodeRoute, uid, type RouteDoc } from '$lib/route/model';
	import { routesFor, saveRoute, deleteRoute, openRoute, setActiveRoute } from '$lib/route/storage';
	import { relicById } from '$lib/data/relics';
	import { affixById } from '$lib/data/affixes';
	import { layers } from '$lib/route/layers.svelte';
	import { efficiencySettings } from '$lib/route/efficiency.svelte';
	import { LiveSession, loadPlayer, savePlayer, newRoomId, PLAYER_COLORS } from '$lib/session/session.svelte';

	let { data }: { data: PageData } = $props();
	const dungeon = untrack(() => data.dungeon);

	const editor = new RouteEditor(dungeon, newRoute(dungeon.slug));
	const session = new LiveSession(editor);
	let showLive = $state(false);
	let pendingRoom = $state<string | null>(null); // room from a ?session= link, waiting for a name
	let player = $state({ name: '', color: PLAYER_COLORS[0] });
	let map = $state<ReturnType<typeof MapView>>();
	let tool = $state<Tool>('select');
	let floorId = $state(dungeon.floors[0]?.id ?? 'f1');
	let ready = $state(false);
	let routes = $state<RouteDoc[]>([]);
	let showRoutes = $state(false);
	let showImport = $state(false);
	let showHelp = $state(false);
	let showPanel = $state(true);

	let importText = $state('');
	let importError = $state('');
	let renaming = $state(false);
	let renameText = $state('');
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	const TOOLS: { id: Tool; label: string; key: string; icon?: string }[] = [
		{ id: 'select', label: 'Select & pull', key: 'V' },
		{ id: 'draw', label: 'Draw', key: 'D' },
		{ id: 'arrow', label: 'Arrow', key: 'A' },
		{ id: 'stealth', label: 'Stealth path (Orb of Shadows)', key: 'S', icon: relicById.stealth?.icon },
		{ id: 'portal', label: 'Portal (Humming Portalstone)', key: 'P', icon: relicById.portal?.icon },
		{ id: 'note', label: 'Note', key: 'T' },
		{ id: 'erase', label: 'Erase annotations', key: 'E' }
	];

	function notify(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2400);
	}

	function refreshRoutes() {
		routes = routesFor(dungeon.slug);
	}

	function switchTo(doc: RouteDoc) {
		editor.load(doc);
		setActiveRoute(dungeon.slug, doc.id);
		showRoutes = false;
		refreshRoutes();
	}

	function hasContent(doc: RouteDoc) {
		return doc.pulls.length > 0 || doc.annotations.length > 0 || doc.chickens.length > 0;
	}

	onMount(async () => {
		layers.init();
		efficiencySettings.init();
		player = loadPlayer();
		const params = new URLSearchParams(location.search);
		const room = params.get('session');
		if (room) {
			switchTo(openRoute(dungeon.slug));
			pendingRoom = room;
			showLive = true;
			ready = true;
			return;
		}
		const hash = location.hash;
		if (hash.includes('r=')) {
			try {
				const doc = await decodeRoute(hash);
				if (doc.dungeon === dungeon.slug) {
					saveRoute(doc);
					switchTo(doc);
					notify(`Imported “${doc.name}”`);
				}
			} catch {
				notify('That route link could not be read');
				switchTo(openRoute(dungeon.slug));
			}
			replaceState(location.pathname, {});
		} else {
			switchTo(openRoute(dungeon.slug));
		}
		ready = true;
	});

	// Send local edits to the live session.
	$effect(() => {
		editor.revision;
		untrack(() => {
			if (!editor.remoteChange) session.pushDoc();
		});
	});

	// Share which pull you're looking at.
	$effect(() => {
		const pull = editor.selectedPullId;
		untrack(() => session.presence(lastCursor, pull));
	});

	let lastCursor: { x: number; y: number; floor: string } | null = null;
	function onCursor(c: { x: number; y: number; floor: string } | null) {
		lastCursor = c;
		session.presence(c, editor.selectedPullId);
	}

	function liveUrl(room: string) {
		return `${location.origin}/planner/${dungeon.slug}?session=${room}`;
	}

	async function startLive() {
		if (!player.name.trim()) return;
		savePlayer(player);
		const room = newRoomId();
		session.start(room, player, true);
		replaceState(`${location.pathname}?session=${room}`, {});
		await navigator.clipboard.writeText(liveUrl(room)).catch(() => {});
		notify('Live session started. Invite link copied');
	}

	function joinLive() {
		if (!player.name.trim() || !pendingRoom) return;
		savePlayer(player);
		session.start(pendingRoom, player, false);
		pendingRoom = null;
		showLive = false;
	}

	function leaveLive() {
		session.leave();
		replaceState(location.pathname, {});
		showLive = false;
		notify('You left the live session. The route stays saved on this device');
	}

	async function copyInvite() {
		if (!session.room) return;
		await navigator.clipboard.writeText(liveUrl(session.room)).catch(() => {});
		notify('Invite link copied');
	}

	// Autosave every change; skip untouched new routes so the library stays clean.
	$effect(() => {
		editor.revision;
		if (!ready) return;
		const doc = $state.snapshot(editor.doc) as RouteDoc;
		untrack(() => {
			if (!hasContent(doc) && !routes.some((r) => r.id === doc.id)) return;
			saveRoute(doc);
			setActiveRoute(dungeon.slug, doc.id);
			refreshRoutes();
		});
	});

	// --- route management ----------------------------------------------------
	function createRoute() {
		switchTo(newRoute(dungeon.slug, `Route ${routes.length + 1}`));
	}

	function duplicateRoute() {
		const copy = { ...($state.snapshot(editor.doc) as RouteDoc), id: uid(), name: `${editor.doc.name} (copy)`, updatedAt: Date.now() };
		saveRoute(copy);
		switchTo(copy);
		notify('Route duplicated');
	}

	function removeRoute() {
		if (!confirm(`Delete “${editor.doc.name}”? This can't be undone.`)) return;
		deleteRoute(editor.doc.id);
		refreshRoutes();
		switchTo(routes[0] ?? newRoute(dungeon.slug));
	}

	function startRename() {
		renameText = editor.doc.name;
		renaming = true;
	}

	function finishRename() {
		if (renaming && renameText.trim() && renameText.trim() !== editor.doc.name) editor.rename(renameText);
		renaming = false;
	}

	function focusInput(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	async function shareLink() {
		const code = await encodeRoute($state.snapshot(editor.doc) as RouteDoc);
		const url = `${location.origin}/planner/${dungeon.slug}#r=${code}`;
		await navigator.clipboard.writeText(url).catch(() => {});
		notify('Share link copied to clipboard');
	}

	/** Plain-text route summary for Discord, ending with the share link. */
	async function copySummary() {
		showRoutes = false;
		const code = await encodeRoute($state.snapshot(editor.doc) as RouteDoc);
		const url = `${location.origin}/planner/${dungeon.slug}#r=${code}`;
		const st = editor.stats;
		const affixNames = [...editor.affixes].map((a) => affixById[a]?.name).filter(Boolean);
		const lines = [
			`**${dungeon.name}**: ${editor.doc.name}`,
			`${editor.percent.toFixed(1)}% in ${editor.doc.pulls.filter((p) => p.spawns.length).length} pulls${editor.timeBonus ? ` · +${editor.timeBonus}s from the mini-boss` : ''}${affixNames.length ? ` · ${affixNames.join(', ')}` : ''}`,
			''
		];
		editor.doc.pulls.forEach((p, i) => {
			const counts = new Map<string, number>();
			for (const id of p.spawns) {
				if (editor.isRemoved(id)) continue;
				const e = editor.enemyOf(id);
				if (!e) continue;
				const name = editor.chickens.has(id) ? `${e.name} (chicken)` : e.name;
				counts.set(name, (counts.get(name) ?? 0) + 1);
			}
			if (!counts.size && !p.note) return;
			const mobs = [...counts].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(', ') || '(no enemies)';
			const kicks = editor.ccSummary(p.spawns).kicks.map(([n]) => n);
			let line = `${i + 1}. ${mobs}: +${st.pullScores[i]} → ${editor.pct(st.cumulative[i]).toFixed(1)}%`;
			if (kicks.length) line += ` · kick ${kicks.join(', ')}`;
			const em = st.emissaryPulls.flatMap((pi, k) => (pi === i ? [k + 1] : []));
			if (em.length) line += ` · Emissary ${em.join(' & ')}`;
			if (p.note) line += ` · ${p.note}`;
			lines.push(line);
		});
		lines.push('', url);
		await navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
		notify('Route summary copied: paste it into Discord');
	}

	async function copyString() {
		showRoutes = false;
		const code = await encodeRoute($state.snapshot(editor.doc) as RouteDoc);
		await navigator.clipboard.writeText(code).catch(() => {});
		notify('Route string copied');
	}

	async function doImport() {
		importError = '';
		try {
			const doc = await decodeRoute(importText);
			if (doc.dungeon !== dungeon.slug) {
				const code = await encodeRoute(doc);
				showImport = false;
				await goto(`/planner/${doc.dungeon}#r=${code}`);
				location.reload();
				return;
			}
			saveRoute(doc);
			switchTo(doc);
			showImport = false;
			importText = '';
			notify(`Imported “${doc.name}”`);
		} catch {
			importError = "That doesn't look like a Fellowroute link or route string.";
		}
	}

	function clearRoute() {
		if (!editor.doc.pulls.length && !editor.doc.annotations.length) return;
		editor.clear();
		notify('Route cleared. Press Ctrl+Z to undo');
	}

	function focusPull(id: string) {
		map?.focusPull(id);
	}

	function pickTool(t: Tool) {
		map?.cancelDraft();
		tool = t;
		// Don't let people draw on a layer they've hidden.
		const layer = t === 'note' ? 'notes' : t === 'draw' || t === 'arrow' || t === 'stealth' || t === 'portal' ? 'drawings' : null;
		if (layer && !layers.on[layer]) {
			layers.toggle(layer);
			notify(layer === 'notes' ? 'Map notes shown again' : 'Drawings shown again');
		}
	}

	// --- keyboard ----------------------------------------------------------------
	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, [contenteditable]')) return;
		const mod = e.ctrlKey || e.metaKey;
		const k = e.key.toLowerCase();

		if (mod && k === 'z') {
			e.preventDefault();
			if (e.shiftKey) editor.redo();
			else editor.undo();
			return;
		}
		if (mod && k === 'y') { e.preventDefault(); editor.redo(); return; }
		if (mod && k === 's') { e.preventDefault(); shareLink(); return; }
		if (mod) return;

		if (e.key === 'Escape') {
			if (showHelp || showImport || showRoutes || (showLive && !pendingRoom)) { showHelp = showImport = showRoutes = showLive = false; return; }
			map?.cancelDraft();
			if (tool !== 'select') tool = 'select';
			else editor.selectedPullId = null;
			return;
		}
		if (e.key === '?') { showHelp = !showHelp; return; }
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			editor.selectRelative(e.key === 'ArrowDown' ? 1 : -1);
			if (editor.selectedPullId) focusPull(editor.selectedPullId);
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selectedPullId) {
			e.preventDefault();
			editor.deletePull(editor.selectedPullId);
			return;
		}
		if (k === 'n') { editor.addPull(); return; }
		if (k === 'f') { map?.fit(); return; }
		if (k === 'c') { layers.toggle('cc'); notify(layers.on.cc ? 'Kick & stun badges on' : 'Kick & stun badges off'); return; }
		if (k === 'l') { layers.toggle('patrols'); notify(layers.on.patrols ? 'Patrol paths on' : 'Patrol paths off'); return; }
		if (e.key === '[' || e.key === ']') {
			const i = dungeon.floors.findIndex((f) => f.id === floorId);
			const next = dungeon.floors[i + (e.key === ']' ? 1 : -1)];
			if (next) floorId = next.id;
			return;
		}
		const toolHit = TOOLS.find((x) => x.key.toLowerCase() === k);
		if (toolHit) pickTool(toolHit.id);
	}

	let pct = $derived(editor.percent);
	const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<svelte:head>
	<title>{dungeon.name} · Fellowroute (beta)</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div class="app">
	<header class="topbar" style:--banner={dungeon.art?.banner ? `url(${dungeon.art.banner})` : 'none'}>
		<a class="home" href="/" title="All dungeons">
			<svg viewBox="0 0 20 20" width="18" height="18"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
		</a>

		<div class="title">
			<div class="dungeon-name display">{dungeon.name} <span class="beta-tag" title="Fellowroute is in public beta">Beta</span></div>
			<div class="route-row">
				{#if renaming}
					<input class="rename" bind:value={renameText} use:focusInput onblur={finishRename}
						onkeydown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') renaming = false; }} />
				{:else}
					<button class="route-name" onclick={() => (showRoutes = !showRoutes)} title="Switch route">
						{editor.doc.name}
						<svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
					</button>
				{/if}
				{#if showRoutes}
					<div class="routes-menu">
						<div class="menu-label">Your routes for {dungeon.name}</div>
						{#each routes as r (r.id)}
							<button class="route-item" class:current={r.id === editor.doc.id} onclick={() => switchTo(r)}>
								<span>{r.name}</span>
								<span class="muted">{r.pulls.length} pulls</span>
							</button>
						{:else}
							<div class="muted pad">Nothing saved yet. Routes save automatically.</div>
						{/each}
						<hr />
						<button class="route-item" onclick={createRoute}>+ New route</button>
						<button class="route-item" onclick={() => { showRoutes = false; startRename(); }}>Rename…</button>
						<button class="route-item" onclick={duplicateRoute}>Duplicate</button>
						<button class="route-item" onclick={copySummary}>Copy summary for Discord</button>
						<button class="route-item" onclick={copyString}>Copy route string</button>
						<button class="route-item danger" onclick={removeRoute}>Delete route</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="progress">
			<div class="pct-line">
				<span class="pct" class:complete={pct >= 100}>{pct.toFixed(1)}%</span>
				<span class="muted">{editor.stats.creditedTotal} / {dungeon.requiredScore} score · {editor.doc.pulls.length} pulls{#if dungeon.timeLimit}&nbsp;· {fmtTime(dungeon.timeLimit + editor.timeBonus)}{/if}</span>
				{#if editor.timeBonus}<span class="pill time" title="Timer gained back from the mini-boss in this route">+{editor.timeBonus}s</span>{/if}
				{#if editor.affixes.has('shadow-lord')}<span class="pill shadow" title="Shadow Lord's Trial: kill score is held until an Emissary dies. Kills drop Shadow Orbs (30 per Emissary); the counter shows what's been paid out.">{editor.emissaries}/{editor.stats.emissaryMax} emissaries · {editor.pct(editor.total).toFixed(0)}% killed</span>{/if}
			</div>
			<div class="bar">
				<div class="fill" class:complete={pct >= 100} style="width:{Math.min(pct, 100)}%"></div>
			</div>
		</div>

		<div class="actions">
			<button class="btn icon ghost" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!editor.canUndo} onclick={() => editor.undo()}>
				<svg viewBox="0 0 20 20" width="16" height="16"><path d="M7 5 3 9l4 4M3.5 9H12a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			<button class="btn icon ghost" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!editor.canRedo} onclick={() => editor.redo()}>
				<svg viewBox="0 0 20 20" width="16" height="16"><path d="m13 5 4 4-4 4M16.5 9H8a5 5 0 0 0 0 10h2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
			</button>
			{#if session.status !== 'idle' && session.status !== 'error'}
				<button class="live-pill" onclick={() => (showLive = true)} title="Live session">
					<span class="live-dot" class:warn={session.status !== 'live'}></span>
					{session.status === 'live' ? 'Live' : 'Connecting…'}
					<span class="avatars">
						<span class="avatar" style="background:{player.color}" title="{player.name} (you)">{player.name.slice(0, 1).toUpperCase()}</span>
						{#each session.others.slice(0, 5) as m (m.id)}
							<span class="avatar" style="background:{m.color}" title={m.name}>{m.name.slice(0, 1).toUpperCase()}</span>
						{/each}
						{#if session.others.length > 5}<span class="avatar more">+{session.others.length - 5}</span>{/if}
					</span>
				</button>
			{:else}
				<button class="btn" onclick={() => (showLive = true)} title="Plan together in real time">
					<svg viewBox="0 0 20 20" width="15" height="15"><circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="14" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M2 16c.6-3 2.6-4.5 5-4.5s4.4 1.5 5 4.5M12.5 12c2.3 0 4 1.1 4.6 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
					Live
				</button>
			{/if}
			<button class="btn" onclick={() => (showImport = true)}>Import</button>
			<button class="btn" onclick={copySummary} disabled={!editor.doc.pulls.length} title="Copy the pull list as text, with a share link, to paste into Discord">Discord</button>
			<button class="btn primary" onclick={shareLink} title="Copy a share link (Ctrl+S)">Share</button>
			<button class="btn icon ghost" title="Help & shortcuts (?)" onclick={() => (showHelp = true)}>?</button>
		</div>
	</header>

	<div class="body">
		<aside class="left">
			<div class="side-head">
				<span class="display">Pulls</span>
				<button class="btn ghost small" onclick={clearRoute} disabled={!editor.doc.pulls.length && !editor.doc.annotations.length}>Clear</button>
			</div>
			<AffixBar {editor} />
			<PullList {editor} onFocusPull={focusPull} members={session.others} />
		</aside>

		<main class="center">
			<div class="tools" role="toolbar" aria-label="Map tools">
				{#each TOOLS as t}
					<button class="tool" class:active={tool === t.id} title="{t.label} ({t.key})" aria-label={t.label} onclick={() => pickTool(t.id)}>
						{#if t.icon}
							<img src={t.icon} alt="" />
						{:else if t.id === 'select'}
							<svg viewBox="0 0 20 20" width="18" height="18"><path d="M5 3l10 6.5-4.3 1L13 15.5 11 16.5 8.8 11.6 5 14z" fill="currentColor" /></svg>
						{:else if t.id === 'draw'}
							<svg viewBox="0 0 20 20" width="18" height="18"><path d="M4 15.5c2-1 2.5-4 5-5s4 1 6.5-1.5M13.5 4.5l2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
						{:else if t.id === 'arrow'}
							<svg viewBox="0 0 20 20" width="18" height="18"><path d="M4 16 15 5M8.5 5H15v6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
						{:else if t.id === 'note'}
							<svg viewBox="0 0 20 20" width="18" height="18"><path d="M4 4h12v9l-3 3H4z M13 16v-3h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M7 8h6M7 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
						{:else if t.id === 'erase'}
							<svg viewBox="0 0 20 20" width="18" height="18"><path d="m8 16-4-4 7.5-7.5 4 4L10 14m-2 2h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" /></svg>
						{/if}
						<kbd>{t.key}</kbd>
					</button>
				{/each}
			</div>

			<MapView bind:this={map} {editor} bind:tool bind:floorId cursors={session.others} onCursor={session.live ? onCursor : undefined} />

			<button class="panel-toggle btn icon" title={showPanel ? 'Hide panel' : 'Show enemies & relics'} aria-label="Toggle side panel" onclick={() => (showPanel = !showPanel)}>
				<svg viewBox="0 0 20 20" width="16" height="16"><path d={showPanel ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
			</button>
		</main>

		{#if showPanel}
			<aside class="right">
				<SidePanel {editor} onTool={pickTool} onFocus={(ids) => map?.focusSpawns(ids)} />
			</aside>
		{/if}
	</div>

	{#if toast}
		<div class="toast" role="status">{toast}</div>
	{/if}

	{#if showLive}
		<div class="modal-backdrop" role="presentation" onclick={() => !pendingRoom && (showLive = false)}>
			<div class="modal" role="dialog" aria-label="Live session" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				{#if pendingRoom}
					<h2 class="display">Join live session</h2>
					<p class="muted">You've been invited to plan {dungeon.name} together. Everyone sees edits as they happen.</p>
				{:else if session.status === 'live' || session.status === 'reconnecting' || session.status === 'connecting'}
					<h2 class="display">Live session</h2>
					<p class="muted">Share the invite link. Everyone who opens it edits this route with you in real time.</p>
				{:else}
					<h2 class="display">Plan together</h2>
					<p class="muted">Start a live session and send the link to your group. Pulls, notes, drawings and affixes sync instantly, and you'll see each other's cursors.</p>
				{/if}

				{#if session.status === 'live' || session.status === 'reconnecting'}
					<div class="members">
						<div class="member"><span class="avatar" style="background:{player.color}">{player.name.slice(0, 1).toUpperCase()}</span>{player.name} <span class="muted">(you)</span></div>
						{#each session.others as m (m.id)}
							<div class="member"><span class="avatar" style="background:{m.color}">{m.name.slice(0, 1).toUpperCase()}</span>{m.name}</div>
						{/each}
					</div>
					<div class="invite">
						<input readonly value={session.room ? liveUrl(session.room) : ''} onfocus={(e) => e.currentTarget.select()} />
						<button class="btn primary" onclick={copyInvite}>Copy link</button>
					</div>
					<div class="modal-actions">
						<button class="btn danger" onclick={leaveLive}>Leave session</button>
						<button class="btn" onclick={() => (showLive = false)}>Close</button>
					</div>
				{:else}
					<label class="field">
						<span>Your name</span>
						<input bind:value={player.name} maxlength="24" placeholder="e.g. Tank Andy"
							onkeydown={(e) => e.key === 'Enter' && (pendingRoom ? joinLive() : startLive())} />
					</label>
					<div class="colors">
						{#each PLAYER_COLORS as c}
							<button class="color" class:active={player.color === c} style="background:{c}" aria-label="Colour {c}" onclick={() => (player.color = c)}></button>
						{/each}
					</div>
					{#if session.error}<p class="error">{session.error}</p>{/if}
					<div class="modal-actions">
						{#if pendingRoom}
							<button class="btn" onclick={() => { pendingRoom = null; showLive = false; replaceState(location.pathname, {}); }}>Plan alone</button>
							<button class="btn primary" disabled={!player.name.trim()} onclick={joinLive}>Join session</button>
						{:else}
							<button class="btn" onclick={() => (showLive = false)}>Cancel</button>
							<button class="btn primary" disabled={!player.name.trim()} onclick={startLive}>Start live session</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if showImport}
		<div class="modal-backdrop" role="presentation" onclick={() => (showImport = false)}>
			<div class="modal" role="dialog" aria-label="Import route" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				<h2 class="display">Import route</h2>
				<p class="muted">Paste a Fellowroute share link or route string.</p>
				<textarea bind:value={importText} rows="5" placeholder="https://…/planner/…#r=z.…"></textarea>
				{#if importError}<p class="error">{importError}</p>{/if}
				<div class="modal-actions">
					<button class="btn" onclick={() => (showImport = false)}>Cancel</button>
					<button class="btn primary" onclick={doImport} disabled={!importText.trim()}>Import</button>
				</div>
			</div>
		</div>
	{/if}

	{#if showHelp}
		<div class="modal-backdrop" role="presentation" onclick={() => (showHelp = false)}>
			<div class="modal help" role="dialog" aria-label="Help" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
				<h2 class="display">How to plan</h2>
				<div class="help-grid">
					<div>
						<h3>Pulls</h3>
						<p><b>Click</b> a pack to add it to the selected pull, or to start a new one.</p>
						<p><b>Ctrl+click</b> a single enemy. <b>Shift+drag</b> to box-select.</p>
						<p><b>Right-click</b> an enemy to Chickenize it (no kill score) or move it.</p>
						<p><b>Drag</b> pulls in the list to reorder them. Hover a pull to see it on the map.</p>
					</div>
					<div>
						<h3>Shortcuts</h3>
						<ul>
							<li><kbd>N</kbd> New pull</li>
							<li><kbd>↑</kbd> <kbd>↓</kbd> Select pull</li>
							<li><kbd>Del</kbd> Delete pull</li>
							<li><kbd>Ctrl</kbd>+<kbd>Z</kbd> Undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> Redo</li>
							<li><kbd>[</kbd> <kbd>]</kbd> Switch floor · <kbd>F</kbd> Fit map</li>
							<li><kbd>Ctrl</kbd>+<kbd>S</kbd> Copy share link</li>
							<li><kbd>C</kbd> Kick / stun badges</li>
							<li><kbd>L</kbd> Patrol paths (more under Layers on the map)</li>
							<li><kbd>Esc</kbd> Cancel / deselect</li>
						</ul>
					</div>
					<div>
						<h3>Tools</h3>
						<ul>
							{#each TOOLS as t}<li><kbd>{t.key}</kbd> {t.label}</li>{/each}
						</ul>
					</div>
				</div>
				<div class="modal-actions"><button class="btn primary" onclick={() => (showHelp = false)}>Got it</button></div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		overflow: hidden;
	}

	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.topbar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 10px 16px;
		min-height: 64px;
		border-bottom: 1px solid var(--border);
		background:
			linear-gradient(90deg, rgba(11, 14, 20, 0.97) 0%, rgba(11, 14, 20, 0.82) 45%, rgba(11, 14, 20, 0.97) 100%),
			var(--banner) center 35% / cover no-repeat,
			var(--bg-raised);
		z-index: 40;
	}

	.home {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: none;
		border-radius: 8px;
		color: var(--text-muted);
		border: 1px solid var(--border);
		background: rgba(20, 26, 37, 0.7);
	}

	.home:hover {
		color: var(--gold-bright);
		border-color: var(--gold-dim);
	}

	.title {
		min-width: 0;
	}

	.dungeon-name {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--gold-bright);
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
		white-space: nowrap;
	}

	.route-row {
		position: relative;
	}

	.route-name {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 1px 6px;
		margin-left: -6px;
		border: none;
		border-radius: 5px;
		background: none;
		color: var(--text-muted);
		font-size: 0.82rem;
		cursor: pointer;
	}

	.route-name:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
	}

	.rename {
		background: var(--bg);
		border: 1px solid var(--gold-dim);
		border-radius: 5px;
		color: var(--text);
		padding: 2px 6px;
		font-size: 0.82rem;
		outline: none;
	}

	.routes-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: -6px;
		width: 280px;
		padding: 6px;
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.menu-label {
		padding: 6px 8px;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
	}

	.route-item {
		display: flex;
		justify-content: space-between;
		padding: 7px 9px;
		border: none;
		border-radius: 6px;
		background: none;
		text-align: left;
		font-size: 0.83rem;
		cursor: pointer;
	}

	.route-item:hover {
		background: var(--panel-hover);
	}

	.route-item.current {
		color: var(--gold-bright);
	}

	.route-item.danger:hover {
		color: #fca5a5;
	}

	.routes-menu hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 5px 2px;
	}

	.pad {
		padding: 6px 9px;
		font-size: 0.8rem;
	}

	.muted {
		color: var(--text-muted);
	}

	.progress {
		flex: 1;
		max-width: 520px;
		margin: 0 auto;
	}

	.pct-line {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 6px;
		font-size: 0.8rem;
		white-space: nowrap;
	}

	.pct {
		font-size: 1.35rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.pct.complete {
		color: var(--success);
	}

	.bar {
		height: 8px;
		border-radius: 5px;
		background: rgba(38, 47, 66, 0.9);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: linear-gradient(90deg, #b98b3c, var(--gold-bright));
		transition: width 0.25s ease;
	}

	.fill.complete {
		background: linear-gradient(90deg, #15803d, var(--success));
	}

	.live-pill {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 32px;
		padding: 0 6px 0 10px;
		border-radius: 16px;
		border: 1px solid rgba(34, 197, 94, 0.45);
		background: rgba(20, 83, 45, 0.35);
		color: #bbf7d0;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.live-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
		animation: pulse 1.6s ease-in-out infinite;
	}

	.live-dot.warn {
		background: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25);
	}

	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 6px rgba(34, 197, 94, 0);
		}
	}

	.avatars {
		display: flex;
	}

	.avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: inline-grid;
		place-items: center;
		color: #0b0e14;
		font-size: 0.68rem;
		font-weight: 800;
		border: 2px solid #0f1a14;
		margin-left: -5px;
	}

	.avatar.more {
		background: var(--panel-hover);
		color: var(--text);
	}

	.members {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 12px 0;
	}

	.member {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.88rem;
	}

	.member .avatar {
		margin: 0;
		border-color: var(--panel);
	}

	.invite {
		display: flex;
		gap: 8px;
	}

	.invite input,
	.field input {
		flex: 1;
		height: 34px;
		padding: 0 10px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		color: var(--text);
		outline: none;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 14px;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.field input:focus {
		border-color: var(--gold-dim);
	}

	.colors {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}

	.color {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
	}

	.color.active {
		border-color: #fff;
	}

	.pill {
		padding: 1px 8px;
		border-radius: 9px;
		font-size: 0.72rem;
		font-weight: 600;
	}

	.pill.time {
		background: rgba(125, 211, 252, 0.15);
		color: #7dd3fc;
	}

	.pill.shadow {
		background: rgba(192, 132, 252, 0.15);
		color: #d8b4fe;
	}

	.actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	.left {
		width: 340px;
		flex: none;
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		border-right: 1px solid var(--border);
	}

	.side-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 14px 4px;
		font-size: 0.95rem;
		color: var(--gold);
	}

	.small {
		height: 26px;
		font-size: 0.75rem;
	}

	.center {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.tools {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 4px;
		background: rgba(16, 20, 29, 0.92);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		backdrop-filter: blur(6px);
	}

	.tool {
		position: relative;
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border: none;
		border-radius: 7px;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}

	.tool:hover {
		background: var(--panel-hover);
		color: var(--text);
	}

	.tool.active {
		background: var(--panel-2);
		color: var(--gold-bright);
		box-shadow: inset 0 0 0 1px var(--gold-dim);
	}

	.tool img {
		width: 24px;
		height: 24px;
		border-radius: 50%;
	}

	.tool kbd {
		position: absolute;
		right: 1px;
		bottom: 1px;
		min-width: 0;
		padding: 0 2px;
		border: none;
		background: none;
		font-size: 0.55rem;
		opacity: 0.6;
	}

	.panel-toggle {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 10;
		background: rgba(26, 33, 48, 0.94);
	}

	.right {
		width: 320px;
		flex: none;
		background: var(--bg-raised);
		border-left: 1px solid var(--border);
		min-height: 0;
	}

	.toast {
		position: fixed;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		padding: 9px 16px;
		background: var(--panel-2);
		border: 1px solid var(--gold-dim);
		border-radius: 9px;
		box-shadow: var(--shadow);
		font-size: 0.85rem;
		z-index: 100;
		animation: rise 0.18s ease-out;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 7, 11, 0.7);
		display: grid;
		place-items: center;
		z-index: 90;
		backdrop-filter: blur(2px);
	}

	.modal {
		width: min(520px, calc(100vw - 32px));
		padding: 20px 22px;
		background: var(--panel);
		border: 1px solid var(--border-strong);
		border-radius: 14px;
		box-shadow: var(--shadow);
	}

	.modal.help {
		width: min(820px, calc(100vw - 32px));
	}

	.modal h2 {
		margin: 0 0 6px;
		font-size: 1.15rem;
		color: var(--gold-bright);
	}

	.modal textarea {
		width: 100%;
		margin-top: 8px;
		padding: 10px;
		background: var(--bg);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		color: var(--text);
		font-family: ui-monospace, monospace;
		font-size: 0.78rem;
		resize: vertical;
		outline: none;
	}

	.modal textarea:focus {
		border-color: var(--gold-dim);
	}

	.error {
		color: #fca5a5;
		font-size: 0.82rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 14px;
	}

	.help-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 20px;
		margin-top: 10px;
	}

	.help-grid h3 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
		margin: 0 0 8px;
	}

	.help-grid p,
	.help-grid li {
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0 0 6px;
	}

	.help-grid b {
		color: var(--text);
	}

	.help-grid ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	@media (max-width: 1100px) {
		.right {
			display: none;
		}

		.left {
			width: 290px;
		}
	}
</style>
