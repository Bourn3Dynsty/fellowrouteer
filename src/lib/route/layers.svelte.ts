/** What the planner shows. Per viewer, remembered in this browser; never part of a route. */
const KEY = 'fellowroute.layers.v1';

export const LAYER_INFO = {
	patrols: { label: 'Patrol paths', group: 'map', key: 'L' },
	patrolSim: { label: 'Patrol simulation (play patrols over time)', group: 'map' },
	cc: { label: 'Kick & stun-immune badges', group: 'map', key: 'C' },
	halos: { label: 'Pack outlines', group: 'map' },
	pullNumbers: { label: 'Pull numbers', group: 'map' },
	dimPulled: { label: 'Fade enemies already pulled', group: 'map' },
	effMap: { label: 'Colour unpulled packs by efficiency', group: 'map' },
	drawings: { label: 'Drawings, arrows, stealth & portals', group: 'map' },
	notes: { label: 'Map notes', group: 'map' },
	poi: { label: 'Start & checkpoints', group: 'map' },
	cursors: { label: "Teammates' cursors", group: 'map' },
	efficiency: { label: 'Efficiency ratings (pulls & tooltips)', group: 'pulls' },
	ccRow: { label: 'Kicks & stuns per pull', group: 'pulls' }
} as const;

export type Layer = keyof typeof LAYER_INFO;

const DEFAULTS: Record<Layer, boolean> = {
	patrols: true,
	patrolSim: false,
	cc: true,
	halos: true,
	pullNumbers: true,
	dimPulled: false,
	effMap: false,
	drawings: true,
	notes: true,
	poi: true,
	cursors: true,
	efficiency: true,
	ccRow: true
};

function load(): Record<Layer, boolean> {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return { ...DEFAULTS, ...saved };
	} catch {
		return { ...DEFAULTS };
	}
}

class Layers {
	on = $state<Record<Layer, boolean>>({ ...DEFAULTS });
	#loaded = false;

	/** Read saved settings (call in the browser). */
	init() {
		if (this.#loaded) return;
		this.#loaded = true;
		this.on = load();
	}

	toggle(layer: Layer) {
		this.on[layer] = !this.on[layer];
		this.#save();
	}

	reset() {
		this.on = { ...DEFAULTS };
		this.#save();
	}

	get changed() {
		return (Object.keys(DEFAULTS) as Layer[]).some((k) => this.on[k] !== DEFAULTS[k]);
	}

	#save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(this.on));
		} catch {
			// private mode etc.: settings just won't persist
		}
	}
}

export const layers = new Layers();
