<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		onAddPull?: () => void;
		onClearRoute?: () => void;
		onImportRoute?: () => void;
		onShareUrl?: () => void;
	}

	let { onAddPull, onClearRoute, onImportRoute, onShareUrl }: Props = $props();
	let showHelp = $state(false);

	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			// Don't trigger shortcuts when typing in inputs
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			// Cmd/Ctrl + K = Add Pull
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				onAddPull?.();
			}

			// Cmd/Ctrl + I = Import
			if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
				e.preventDefault();
				onImportRoute?.();
			}

			// Cmd/Ctrl + S = Share
			if ((e.metaKey || e.ctrlKey) && e.key === 's') {
				e.preventDefault();
				onShareUrl?.();
			}

			// Cmd/Ctrl + Shift + C = Clear
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
				e.preventDefault();
				onClearRoute?.();
			}

			// ? = Show help
			if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				showHelp = !showHelp;
			}

			// Escape = Close help
			if (e.key === 'Escape' && showHelp) {
				showHelp = false;
			}
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if showHelp}
	<div class="shortcuts-overlay" onclick={() => (showHelp = false)}>
		<div class="shortcuts-modal" onclick={(e) => e.stopPropagation()}>
			<div class="shortcuts-header">
				<h3>Keyboard Shortcuts</h3>
				<button class="close-btn" onclick={() => (showHelp = false)}>×</button>
			</div>
			<div class="shortcuts-list">
				<div class="shortcut-item">
					<kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd>
					<span>Add Pull</span>
				</div>
				<div class="shortcut-item">
					<kbd>Ctrl/Cmd</kbd> + <kbd>I</kbd>
					<span>Import Route</span>
				</div>
				<div class="shortcut-item">
					<kbd>Ctrl/Cmd</kbd> + <kbd>S</kbd>
					<span>Share URL</span>
				</div>
				<div class="shortcut-item">
					<kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
					<span>Clear Route</span>
				</div>
				<div class="shortcut-item">
					<kbd>?</kbd>
					<span>Toggle this help</span>
				</div>
				<div class="shortcut-item">
					<kbd>Esc</kbd>
					<span>Close dialogs</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<button class="help-trigger" onclick={() => (showHelp = true)} title="Keyboard shortcuts (?)">
	?
</button>

<style>
	.help-trigger {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		color: white;
		font-size: 1.5rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
		transition: all 0.2s;
		z-index: 100;
	}

	.help-trigger:hover {
		transform: scale(1.1);
		box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
	}

	.shortcuts-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.shortcuts-modal {
		background: #1e293b;
		border-radius: 16px;
		width: 90%;
		max-width: 500px;
		border: 1px solid #334155;
	}

	.shortcuts-header {
		padding: 1.5rem;
		border-bottom: 1px solid #334155;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.shortcuts-header h3 {
		margin: 0;
		font-size: 1.5rem;
		color: #f1f5f9;
	}

	.close-btn {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 2rem;
		cursor: pointer;
		line-height: 1;
		padding: 0;
		width: 32px;
		height: 32px;
	}

	.close-btn:hover {
		color: #f1f5f9;
	}

	.shortcuts-list {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.shortcut-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
	}

	.shortcut-item span {
		margin-left: auto;
		color: #94a3b8;
		font-size: 0.875rem;
	}

	kbd {
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		font-family: monospace;
		font-size: 0.875rem;
		color: #e5e7eb;
		box-shadow: 0 2px 0 #334155;
	}
</style>
