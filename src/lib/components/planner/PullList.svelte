<script lang="ts">
	import { untrack } from 'svelte';
	import type { RouteEditor } from '$lib/route/editor.svelte';
	import { PULL_COLORS } from '$lib/route/model';
	import { relicById } from '$lib/data/relics';
	import { affixById } from '$lib/data/affixes';
	import { layers } from '$lib/route/layers.svelte';
	import { fmtHealth } from '$lib/data/levels';
	import { createRatings } from '$lib/route/efficiency.svelte';
	import type { Member } from '$lib/session/session.svelte';

	interface Props {
		editor: RouteEditor;
		onFocusPull?: (id: string) => void;
		/** Live-session teammates, to show who has which pull selected. */
		members?: Member[];
	}

	let { editor, onFocusPull, members = [] }: Props = $props();
	const ratings = createRatings(untrack(() => editor));

	const chickenIcon = relicById.chicken?.icon;
	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);
	let editingNote = $state<string | null>(null);
	let noteText = $state('');
	let colorFor = $state<string | null>(null);
	let listEl: HTMLDivElement;

	function groups(spawns: string[]) {
		const map = new Map<string, { id: string; name: string; icon?: string; count: number; chickens: number; empowered: number; score: number; mb: boolean }>();
		for (const id of spawns) {
			if (editor.isRemoved(id)) continue;
			const e = editor.enemyOf(id);
			if (!e) continue;
			const g = map.get(e.id) ?? { id: e.id, name: e.name, icon: e.icon, count: 0, chickens: 0, empowered: 0, score: 0, mb: e.type === 'miniboss' };
			g.count++;
			if (editor.chickens.has(id)) g.chickens++;
			if (editor.isEmpowered(id)) g.empowered++;
			g.score += editor.spawnScore(id);
			map.set(e.id, g);
		}
		return [...map.values()].sort((a, b) => b.score - a.score || b.count - a.count);
	}

	function select(id: string) {
		editor.selectedPullId = editor.selectedPullId === id ? null : id;
		if (editor.selectedPullId) onFocusPull?.(id);
	}

	function startNote(id: string, current = '') {
		editingNote = id;
		noteText = current;
	}

	function saveNote() {
		if (editingNote) editor.setPullNote(editingNote, noteText);
		editingNote = null;
	}

	function focusInput(node: HTMLTextAreaElement) {
		node.focus();
	}

	function drop() {
		if (dragIndex !== null && dropIndex !== null) {
			editor.movePull(dragIndex, dropIndex > dragIndex ? dropIndex - 1 : dropIndex);
		}
		dragIndex = dropIndex = null;
	}

	// Keep the selected pull visible when changed from the keyboard or map.
	$effect(() => {
		const id = editor.selectedPullId;
		if (!id || !listEl) return;
		listEl.querySelector(`[data-pull="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	const fmt = (v: number) => v.toFixed(1);
	const effClass = (e: number) => (e >= 1.15 ? 'good' : e <= 0.85 ? 'poor' : 'avg');
</script>

<div class="pulls" bind:this={listEl} role="list">
	{#each editor.doc.pulls as pull, i (pull.id)}
		{@const score = editor.pullScores[i]}
		{@const cum = editor.cumulative[i]}
		{@const credited = editor.stats.credited}
		{@const done = editor.pct(credited[i]) >= 100 && (i === 0 || editor.pct(credited[i - 1]) < 100)}
		{@const shadow = editor.affixes.has('shadow-lord')}
		{@const cleared = pull.spawns.filter((id) => editor.isRemoved(id)).length}
		{@const patrols = new Set(pull.spawns.map((id) => editor.patrolOf.get(id)?.id).filter(Boolean)).size}
		{@const hp = editor.healthOf(pull.spawns)}
		{@const eff = ratings.of(pull.spawns)}
		{@const cc = editor.ccSummary(pull.spawns)}
		{@const bonus = pull.spawns.reduce((t, id) => t + (id.includes('-mb-') && editor.affixes.has(id.split('-mb-')[1]) ? (affixById[id.split('-mb-')[1]]?.timeBonus ?? 0) : 0), 0)}
		{@const emissaries = editor.stats.emissaryPulls.map((p, k) => (p === i ? k + 1 : 0)).filter(Boolean)}
		{#if dropIndex === i && dragIndex !== null && dragIndex !== i && dragIndex !== i - 1}
			<div class="drop-line"></div>
		{/if}
		<div
			class="pull"
			class:selected={pull.id === editor.selectedPullId}
			class:dragging={dragIndex === i}
			data-pull={pull.id}
			role="listitem"
			draggable="true"
			ondragstart={(e) => { dragIndex = i; e.dataTransfer?.setData('text/plain', String(i)); }}
			ondragover={(e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); dropIndex = e.clientY < r.top + r.height / 2 ? i : i + 1; }}
			ondrop={(e) => { e.preventDefault(); drop(); }}
			ondragend={() => (dragIndex = dropIndex = null)}
			onmouseenter={() => (editor.highlight = new Set(pull.spawns))}
			onmouseleave={() => (editor.highlight = null)}
		>
			<button class="pull-main" onclick={() => select(pull.id)}>
				<span class="num" style="background:{pull.color}">{i + 1}</span>
				{#each members.filter((m) => m.pull === pull.id) as m (m.id)}
					<span class="viewer" style="background:{m.color}" title="{m.name} is looking at this pull">{m.name.slice(0, 1).toUpperCase()}</span>
				{/each}
				<span class="enemies">
					{#each groups(pull.spawns) as g (g.id)}
						<span class="chip" class:mb={g.mb} title="{g.count}× {g.name}{g.empowered ? ` (${g.empowered} empowered ×3)` : ''}{g.chickens ? ` (${g.chickens} chickenized)` : ''}">
							{#if g.icon}<img src={g.icon} alt={g.name} />{:else}<span class="noicon">{g.name[0]}</span>{/if}
							{#if g.count > 1}<span class="count">{g.count}</span>{/if}
							{#if g.empowered}<span class="emp">×3</span>{/if}
							{#if g.chickens && chickenIcon}<img class="chick" src={chickenIcon} alt="chickenized" />{/if}
						</span>
					{:else}
						<span class="empty">Click packs on the map to add them</span>
					{/each}
				</span>
				<span class="score">
					<span class="gain">
						{#if eff !== null && layers.on.efficiency}<span class="eff {effClass(eff)}" title="Efficiency: {eff.toFixed(2)}× the average pack (kill score per health, with kicks, stun-only casts and stun-immune enemies adding cost; see the Efficiency tab)">{eff.toFixed(1)}×</span>{/if}
						+{score}
					</span>
					{#if shadow}
						<span class="cum shadow" title="{fmt(editor.pct(cum))}% of the kill score killed; Shadow Orbs dropped so far">{fmt(editor.pct(cum))}% · {editor.stats.orbs[i]}◆</span>
					{:else}
						<span class="cum" class:complete={editor.pct(cum) >= 100}>{fmt(editor.pct(cum))}%</span>
					{/if}
					{#if hp}<span class="hp" title="Total enemy health in this pull{editor.level ? ` at key level ${editor.level}` : ' at level 1 (pick a key level above)'}">{fmtHealth(hp)} HP</span>{/if}
				</span>
			</button>

			{#if (layers.on.ccRow && (cc.kicks.length || cc.stuns.length || cc.immune)) || bonus || cleared || patrols}
				<div class="cc-row" class:expanded={pull.id === editor.selectedPullId}>
					{#if cc.kicks.length && layers.on.ccRow}
						<span class="cc kick" title={cc.kicks.map(([n, c]) => `${n} ×${c}`).join('\n')}>
							<svg viewBox="0 0 12 12" width="10" height="10"><path d="M7 1 2.5 7H6l-1 4 4.5-6H6z" fill="currentColor" /></svg>
							{cc.kicks.reduce((t, [, c]) => t + c, 0)} kick{cc.kicks.reduce((t, [, c]) => t + c, 0) === 1 ? '' : 's'}
						</span>
					{/if}
					{#if cc.stuns.length && layers.on.ccRow}
						<span class="cc stun" title={cc.stuns.map(([n, c]) => `${n} ×${c} (stun to stop)`).join('\n')}>
							{cc.stuns.reduce((t, [, c]) => t + c, 0)} stun-stop
						</span>
					{/if}
					{#if cc.immune && layers.on.ccRow}
						<span class="cc immune" title="Stun immune enemies in this pull">{cc.immune} stun immune</span>
					{/if}
					{#if bonus}
						<span class="cc time" title="Timer gained back from the mini-boss">+{bonus}s</span>
					{/if}
					{#if patrols}
						<span class="cc patrol" title="This pull includes enemies that walk a patrol path: time it or wait for them">{patrols} patrol{patrols === 1 ? '' : 's'}</span>
					{/if}
					{#if cleared}
						<span class="cc cleared" title="These enemies don't spawn this week: the mini-boss replaces them">{cleared} cleared by mini-boss</span>
					{/if}
					{#if layers.on.ccRow && pull.id === editor.selectedPullId && (cc.kicks.length || cc.stuns.length)}
						<div class="cc-detail">
							{#each cc.kicks as [n, c]}<div><span class="dotk"></span>{n}<b>×{c}</b></div>{/each}
							{#each cc.stuns as [n, c]}<div><span class="dots"></span>{n}<b>×{c}</b><em>stun</em></div>{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if pull.id === editor.selectedPullId}
				<div class="pull-tools">
					<button class="tool" onclick={() => (colorFor = colorFor === pull.id ? null : pull.id)}>
						<span class="swatch" style="background:{pull.color}"></span> Colour
					</button>
					<button class="tool" onclick={() => startNote(pull.id, pull.note)}>✎ {pull.note ? 'Edit note' : 'Note'}</button>
					<span class="spacer"></span>
					<button class="tool del" title="Delete pull (Del)" onclick={() => editor.deletePull(pull.id)}>✕ Delete</button>
				</div>
			{/if}

			{#if colorFor === pull.id}
				<div class="colors">
					{#each PULL_COLORS as c}
						<button class="swatch-btn" class:active={c === pull.color} style="background:{c}" aria-label="Use colour {c}"
							onclick={() => { editor.setPullColor(pull.id, c); colorFor = null; }}></button>
					{/each}
				</div>
			{/if}

			{#if editingNote === pull.id}
				<textarea
					class="note-input"
					bind:value={noteText}
					use:focusInput
					rows="2"
					placeholder="Note for this pull (e.g. 'LoS behind pillar', 'Use drums')"
					onblur={saveNote}
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); }
						if (e.key === 'Escape') { e.stopPropagation(); editingNote = null; }
					}}
				></textarea>
			{:else if pull.note}
				<button class="note" onclick={() => startNote(pull.id, pull.note)}>{pull.note}</button>
			{/if}
		</div>
		{#if emissaries.length}
			<div class="emissary-line" title="Kill it to bank the score held so far">
				<span>Emissary {emissaries.join(' & ')}/{editor.stats.emissaryMax} spawns ({fmtHealth(editor.emissaryHealth)} HP) · banks {fmt(editor.pct(credited[i]))}%</span>
			</div>
		{/if}
		{#if done}
			<div class="complete-line"><span>Kill score complete</span></div>
		{/if}
	{/each}
	{#if dropIndex === editor.doc.pulls.length && dragIndex !== null && dragIndex !== editor.doc.pulls.length - 1}
		<div class="drop-line"></div>
	{/if}

	<button class="add" onclick={() => editor.addPull()}>
		<span>+ New pull</span><kbd>N</kbd>
	</button>
</div>

<style>
	.pulls {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.pull {
		position: relative;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		transition: border-color 0.12s, background 0.12s;
	}

	.pull:hover {
		border-color: var(--border-strong);
	}

	.pull.selected {
		border-color: var(--gold-dim);
		background: var(--panel-2);
		box-shadow: 0 0 0 1px var(--gold-dim), 0 6px 18px rgba(0, 0, 0, 0.3);
	}

	.pull.dragging {
		opacity: 0.4;
	}

	.pull-main {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		padding-right: 8px;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
	}

	.num {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 0.8rem;
		color: #fff;
		box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25);
	}

	.viewer {
		flex: none;
		width: 18px;
		height: 18px;
		margin-left: -16px;
		margin-top: -22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: #0b0e14;
		font-size: 0.6rem;
		font-weight: 800;
		border: 2px solid var(--panel);
	}

	.enemies {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.chip {
		position: relative;
		width: 32px;
		height: 32px;
	}

	.chip img:not(.chick) {
		width: 32px;
		height: 32px;
		border-radius: 7px;
		border: 1px solid var(--border-strong);
		display: block;
	}

	.noicon {
		width: 32px;
		height: 32px;
		border-radius: 7px;
		display: grid;
		place-items: center;
		background: var(--panel-hover);
		font-weight: 600;
	}

	.count {
		position: absolute;
		right: -4px;
		bottom: -4px;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		border-radius: 9px;
		background: #0b0e14;
		border: 1px solid var(--border-strong);
		font-size: 0.68rem;
		font-weight: 700;
		display: grid;
		place-items: center;
	}

	.chip.mb img:not(.chick) {
		border-color: #7dd3fc;
		box-shadow: 0 0 0 1px #7dd3fc;
	}

	.emp {
		position: absolute;
		left: -4px;
		top: -5px;
		padding: 0 3px;
		border-radius: 4px;
		background: #facc15;
		color: #1b1408;
		font-size: 0.58rem;
		font-weight: 800;
		line-height: 1.4;
	}

	.cc-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 0 10px 8px 46px;
		margin-top: -2px;
	}

	.cc {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 1px 6px;
		border-radius: 9px;
		font-size: 0.68rem;
		font-weight: 600;
		cursor: default;
	}

	.cc.kick {
		background: rgba(29, 78, 216, 0.22);
		color: #93c5fd;
	}

	.cc.stun {
		background: rgba(113, 113, 122, 0.25);
		color: #d4d4d8;
	}

	.cc.immune {
		background: rgba(180, 83, 9, 0.22);
		color: #fdba74;
	}

	.cc.time {
		background: rgba(125, 211, 252, 0.15);
		color: #7dd3fc;
	}

	.cc-detail {
		flex-basis: 100%;
		display: grid;
		gap: 2px;
		margin-top: 4px;
		font-size: 0.74rem;
		color: var(--text-muted);
	}

	.cc-detail div {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.cc-detail b {
		color: var(--text);
		font-weight: 600;
	}

	.cc-detail em {
		font-style: normal;
		font-size: 0.66rem;
		color: var(--text-faint);
	}

	.dotk,
	.dots {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #3b82f6;
	}

	.dots {
		background: #a1a1aa;
	}

	.emissary-line {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 2px 4px;
		color: #c084fc;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.emissary-line::before,
	.emissary-line::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(192, 132, 252, 0.4);
	}

	.chick {
		position: absolute;
		left: -4px;
		bottom: -4px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 1px solid #0b0e14;
	}

	.empty {
		color: var(--text-faint);
		font-size: 0.78rem;
		font-style: italic;
		padding: 7px 0;
	}

	.score {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
		min-width: 52px;
	}

	.gain {
		font-weight: 700;
		color: var(--gold-bright);
		font-size: 0.9rem;
	}

	.cum {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.eff {
		display: inline-block;
		margin-right: 4px;
		padding: 0 4px;
		border-radius: 4px;
		font-size: 0.66rem;
		font-weight: 700;
		vertical-align: 1px;
	}

	.eff.good {
		background: rgba(34, 197, 94, 0.15);
		color: #4ade80;
	}

	.eff.avg {
		background: rgba(148, 163, 184, 0.14);
		color: #cbd5e1;
	}

	.eff.poor {
		background: rgba(239, 68, 68, 0.14);
		color: #fca5a5;
	}

	.hp {
		font-size: 0.66rem;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.cum.shadow {
		color: #d8b4fe;
	}

	.cc.patrol {
		background: rgba(226, 232, 240, 0.1);
		color: #e2e8f0;
	}

	.cc.cleared {
		background: rgba(125, 211, 252, 0.1);
		color: #7dd3fc;
	}

	.cum.complete {
		color: var(--success);
	}

	.pull-tools {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 0 8px 7px 44px;
	}

	.spacer {
		flex: 1;
	}

	.tool {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 24px;
		padding: 0 7px;
		border: none;
		border-radius: 5px;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.74rem;
	}

	.tool:hover {
		background: var(--panel-hover);
		color: var(--text);
	}

	.tool.del:hover {
		color: #fca5a5;
	}

	.swatch {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}

	.colors {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		padding: 0 10px 9px 46px;
	}

	.swatch-btn {
		width: 20px;
		height: 20px;
		border-radius: 5px;
		border: 2px solid transparent;
		cursor: pointer;
	}

	.swatch-btn.active {
		border-color: #fff;
	}

	.note {
		display: block;
		margin: -2px 10px 8px 46px;
		width: calc(100% - 56px);
		padding: 5px 8px;
		background: rgba(217, 173, 91, 0.08);
		border: 1px solid rgba(217, 173, 91, 0.2);
		border-radius: 6px;
		color: #e9d8b0;
		font-size: 0.78rem;
		text-align: left;
		white-space: pre-wrap;
		cursor: text;
	}

	.note-input {
		display: block;
		margin: -2px 10px 8px 46px;
		width: calc(100% - 56px);
		padding: 6px 8px;
		background: var(--bg);
		border: 1px solid var(--gold-dim);
		border-radius: 6px;
		color: var(--text);
		font-size: 0.8rem;
		resize: vertical;
		outline: none;
	}

	.drop-line {
		height: 3px;
		border-radius: 2px;
		background: var(--gold);
		margin: -2px 4px;
	}

	.complete-line {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 2px 4px;
		color: var(--success);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.complete-line::before,
	.complete-line::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(34, 197, 94, 0.4);
	}

	.add {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 2px;
		padding: 10px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.add:hover {
		border-color: var(--gold-dim);
		color: var(--gold-bright);
		background: rgba(217, 173, 91, 0.05);
	}
</style>
