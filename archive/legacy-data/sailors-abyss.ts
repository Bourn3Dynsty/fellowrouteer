import type { Dungeon } from '../types';

export const sailorsAbyss: Dungeon = {
	id: 'sailors-abyss',
	name: "Sailor's Abyss",
	slug: 'sailors-abyss',
	type: 'adventure',
	requiredScore: 131,
	timeLimit: 717,
	enemies: [
		{
			id: 'witchreef-lasher',
			name: 'Witchreef Lasher',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Witchreef Toxin',
					description: 'Randomly applies DoT to players. Stacks quickly.',
					dispellable: true,
					damageType: 'nature',
					priority: 'medium'
				}
			],
			notes: 'Be ready with dispels as stacks build up'
		},
		{
			id: 'water-elemental',
			name: 'Water Elemental',
			score: 4,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Healing Waters',
					description: 'Restores mob health',
					interruptible: true,
					priority: 'high'
				},
				{
					name: 'Hydrobolt',
					description: 'Targets random ranged player and cleaves nearby. Stack in melee to prevent casting',
					interruptible: true,
					damageType: 'magic',
					priority: 'medium'
				}
			],
			notes: 'Priority interrupt Healing Waters. Stack in melee to suppress Hydrobolt'
		},
		{
			id: 'vengeful-shade',
			name: 'Vengeful Shade',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Curse of Drowning',
					description: 'Applies magic DoT and 30% slow to random player',
					dispellable: true,
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Bitter Frenzy',
					description: 'Haste buff with extra tank damage and reduced cast time (Vayr\'s Legacy)',
					priority: 'high'
				}
			],
			notes: 'Be ready to dispel or CC the cast'
		},
		{
			id: 'tormented-spectre',
			name: 'Tormented Spectre',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Anguish Unleashed',
					description: 'AoE damage. Can wipe party if not interrupted',
					interruptible: true,
					damageType: 'shadow',
					priority: 'high'
				}
			],
			notes: 'Interrupt or CC EVERY cast'
		},
		{
			id: 'hollowed-corsair',
			name: 'Hollowed Corsair',
			score: 4,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Wailing Strike',
					description: 'Melee swings cleave, applying stacking bleed for 6s',
					damageType: 'physical',
					priority: 'medium'
				}
			],
			notes: 'Tank face away from group. Can kite these slow mobs to drop stacks'
		},
		{
			id: 'fading-raider',
			name: 'Fading Raider',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Fervor',
					description: 'Gains 2% haste per melee hit, stacking up to 20 times',
					priority: 'medium'
				}
			],
			notes: 'Tanks be careful at high stacks'
		},
		{
			id: 'deepbound-magi',
			name: 'Deepbound Magi',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Dark Magic',
					description: 'Can wipe the party if spell goes off',
					interruptible: true,
					damageType: 'shadow',
					priority: 'high'
				}
			],
			notes: 'Must interrupt'
		},
		{
			id: 'eira-white-witch',
			name: 'Eira the White Witch',
			score: 0,
			stunnable: false,
			type: 'miniboss',
			abilities: [
				{
					name: 'Winter Bolt',
					description: 'Bolt of ice dealing high damage. Applies Lingering Chill (30% slow per stack, erupts at 3 stacks)',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Shattering Ice',
					description: 'Spawns frost zones under players. Deals high damage on eruption plus moderate party-wide damage',
					damageType: 'magic',
					priority: 'high'
				}
			]
		},
		{
			id: 'sinthara',
			name: 'Sinthara',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Undertow',
					description: 'Soul damage over time to 2 random non-tanks. Leaves Watery Grave when expired',
					damageType: 'shadow',
					priority: 'medium'
				},
				{
					name: 'Deafening Screech',
					description: 'Large group-wide damage. Silences players caught casting',
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: "Siren's Song",
					description: 'Charms players not attached to mast, forcing them off platform. Interact with mast to bind yourself',
					priority: 'high'
				},
				{
					name: 'Binding Strike',
					description: 'Tethers tank to random player. Gains 50% haste and 50% life steal (Vayr\'s Legacy)',
					priority: 'high'
				}
			],
			notes: 'Fight near mast for LoS and tether point at 50% HP'
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Sinthara',
			enemyId: 'sinthara'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
