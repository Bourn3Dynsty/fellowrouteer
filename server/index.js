// Production entry: serves the built SvelteKit app (adapter-node) plus the live-session relay.
// Build with `npm run build`, then run `node server/index.js` (PORT defaults to 3000).
import http from 'node:http';
import { handler } from '../build/handler.js';
import { attachSessionRelay } from './relay.js';

const port = Number(process.env.PORT ?? 3000);
const server = http.createServer(handler);
attachSessionRelay(server);
server.listen(port, () => console.log(`Fellowroute listening on http://localhost:${port}`));

// Cloud Run (and most container hosts) send SIGTERM before stopping an instance.
for (const signal of ['SIGTERM', 'SIGINT']) {
	process.on(signal, () => {
		server.close();
		server.closeAllConnections?.();
		process.exit(0);
	});
}
