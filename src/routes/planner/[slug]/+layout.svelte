<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();
</script>

<!-- Remount the planner when switching dungeons so per-dungeon state resets. -->
{#key page.params.slug}
	{@render children()}
{/key}
