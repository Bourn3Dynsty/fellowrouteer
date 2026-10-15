import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { attachSessionRelay } from './server/relay.js';

/** Live planning sessions in dev: attach the WebSocket relay to Vite's server. */
function sessionRelay(): Plugin {
	return {
		name: 'fellowroute-session-relay',
		configureServer(server) {
			if (server.httpServer) attachSessionRelay(server.httpServer);
		},
		configurePreviewServer(server) {
			if (server.httpServer) attachSessionRelay(server.httpServer);
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), sessionRelay()]
});
