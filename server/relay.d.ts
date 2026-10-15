import type { WebSocketServer } from 'ws';

export const SESSION_PATH: string;
/** Attach the live-session relay to any Node http(s) server's `upgrade` event. */
export function attachSessionRelay(httpServer: { on(event: 'upgrade', listener: (...args: any[]) => void): unknown }): WebSocketServer;
