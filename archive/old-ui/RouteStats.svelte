<script lang="ts">
	import type { Pull, Dungeon } from '$lib/types';

	interface Props {
		pulls: Pull[];
		dungeon: Dungeon;
	}

	let { pulls, dungeon }: Props = $props();

	function getTotalScore() {
		return pulls.reduce((sum, pull) => sum + pull.totalScore, 0);
	}

	function getCompletionPercentage() {
		return Math.min((getTotalScore() / dungeon.requiredScore) * 100, 100);
	}

	function getAverageEnemiesPerPull() {
		if (pulls.length === 0) return 0;
		const total = pulls.reduce((sum, pull) => sum + pull.enemies.length, 0);
		return (total / pulls.length).toFixed(1);
	}

	function getEfficiencyBreakdown() {
		const breakdown = { excellent: 0, good: 0, average: 0, poor: 0 };
		pulls.forEach((pull) => {
			if (pull.efficiency) {
				breakdown[pull.efficiency]++;
			}
		});
		return breakdown;
	}

	function getHighestPull() {
		if (pulls.length === 0) return null;
		return pulls.reduce((max, pull) => (pull.totalScore > max.totalScore ? pull : max));
	}

	function getLowestPull() {
		if (pulls.length === 0) return null;
		return pulls.reduce((min, pull) => (pull.totalScore < min.totalScore ? pull : min));
	}

	function getDangerousEnemies() {
		const allEnemies = pulls.flatMap((pull) => pull.enemies);
		return allEnemies
			.map((id) => dungeon.enemies.find((e) => e.id === id))
			.filter((e) => e && e.ccImmune).length;
	}

	function getInterruptLoad() {
		const allEnemies = pulls.flatMap((pull) => pull.enemies);
		return allEnemies
			.map((id) => dungeon.enemies.find((e) => e.id === id))
			.filter((e) => e && e.abilities.some((a) => a.interruptible)).length;
	}
</script>

<div class="stats-panel">
	<h4>Route Statistics</h4>

	<div class="stats-grid">
		<div class="stat-card">
			<span class="stat-label">Total Pulls</span>
			<span class="stat-value">{pulls.length}</span>
		</div>

		<div class="stat-card">
			<span class="stat-label">Total Score</span>
			<span class="stat-value" class:complete={getTotalScore() >= dungeon.requiredScore}>
				{getTotalScore()}/{dungeon.requiredScore}
			</span>
		</div>

		<div class="stat-card">
			<span class="stat-label">Avg Enemies/Pull</span>
			<span class="stat-value">{getAverageEnemiesPerPull()}</span>
		</div>

		<div class="stat-card">
			<span class="stat-label">Completion</span>
			<span class="stat-value">{getCompletionPercentage().toFixed(0)}%</span>
		</div>
	</div>

	{#if pulls.length > 0}
		<div class="efficiency-breakdown">
			<h5>Pack Efficiency</h5>
			<div class="efficiency-bars">
				{#each Object.entries(getEfficiencyBreakdown()) as [level, count]}
					{#if count > 0}
						<div class="efficiency-row">
							<span class="efficiency-label {level}">{level}</span>
							<div class="efficiency-bar-container">
								<div
									class="efficiency-bar {level}"
									style="width: {(count / pulls.length) * 100}%"
								></div>
							</div>
							<span class="efficiency-count">{count}</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>

		<div class="highlights">
			<h5>Highlights</h5>
			{#if getHighestPull()}
				{@const highest = getHighestPull()!}
				<div class="highlight-item">
					<span class="highlight-icon">🔝</span>
					<span>Highest: <strong>{highest.name}</strong> ({highest.totalScore} score)</span>
				</div>
			{/if}
			{#if getLowestPull() && pulls.length > 1}
				{@const lowest = getLowestPull()!}
				<div class="highlight-item">
					<span class="highlight-icon">⚠️</span>
					<span>Lowest: <strong>{lowest.name}</strong> ({lowest.totalScore} score)</span>
				</div>
			{/if}
			<div class="highlight-item">
				<span class="highlight-icon">🛡️</span>
				<span>{getDangerousEnemies()} CC Immune enemies</span>
			</div>
			<div class="highlight-item">
				<span class="highlight-icon">💥</span>
				<span>{getInterruptLoad()} enemies with interruptible abilities</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.stats-panel {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 1rem;
		margin-top: 1rem;
	}

	h4 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #f1f5f9;
	}

	h5 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		color: #94a3b8;
		text-transform: uppercase;
		font-weight: 600;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stat-card {
		background: rgba(0, 0, 0, 0.3);
		padding: 0.75rem;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #94a3b8;
		text-transform: uppercase;
		font-weight: 600;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #667eea;
	}

	.stat-value.complete {
		color: #10b981;
	}

	.efficiency-breakdown {
		margin-bottom: 1rem;
	}

	.efficiency-bars {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.efficiency-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.efficiency-label {
		width: 70px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}

	.efficiency-label.excellent {
		color: #10b981;
	}
	.efficiency-label.good {
		color: #3b82f6;
	}
	.efficiency-label.average {
		color: #f59e0b;
	}
	.efficiency-label.poor {
		color: #ef4444;
	}

	.efficiency-bar-container {
		flex: 1;
		height: 20px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
		overflow: hidden;
	}

	.efficiency-bar {
		height: 100%;
		transition: width 0.3s;
	}

	.efficiency-bar.excellent {
		background: #10b981;
	}
	.efficiency-bar.good {
		background: #3b82f6;
	}
	.efficiency-bar.average {
		background: #f59e0b;
	}
	.efficiency-bar.poor {
		background: #ef4444;
	}

	.efficiency-count {
		width: 30px;
		text-align: right;
		font-weight: 600;
		color: #e5e7eb;
	}

	.highlights {
		border-top: 1px solid #334155;
		padding-top: 1rem;
	}

	.highlight-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		color: #e5e7eb;
	}

	.highlight-icon {
		font-size: 1.25rem;
	}

	.highlight-item strong {
		color: #667eea;
	}
</style>
