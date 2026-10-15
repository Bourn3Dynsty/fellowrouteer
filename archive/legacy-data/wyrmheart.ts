import type { Dungeon } from '../types';

export const wyrmheart: Dungeon = {
	id: 'wyrmheart',
	name: 'Wyrmheart',
	slug: 'wyrmheart',
	type: 'adventure',
	requiredScore: 109,
	timeLimit: 806,
	enemies: [
		{
			id: 'deceitful-scholar',
			name: 'Deceitful Scholar',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Rune of Detonation',
					description: 'Channels for AoE damage. TOP PRIORITY interrupt',
					interruptible: true,
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Volatile Orb',
					description: 'Spawns near furthest player, chases them. Deals pulsing + massive hit if reaches target (Vayr\'s Legacy)',
					priority: 'high'
				}
			],
			notes: 'Kite Volatile Orb away from group'
		},
		{
			id: 'blade-of-cithrel',
			name: 'Blade of Cithrel',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Slicing Blades',
					description: 'Whirlwinds and chases target after short delay',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Enrage',
					description: 'At 30% health, gains 30% haste until defeated',
					priority: 'medium'
				},
				{
					name: 'Ice Breaker',
					description: 'Leaps at random player (Vayr\'s Legacy)',
					damageType: 'physical',
					priority: 'medium'
				}
			]
		},
		{
			id: 'coldheart-assassin',
			name: 'Coldheart Assassin',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Wicked Strikes',
					description: 'Jumps to random player, stunning and channeling damage',
					interruptible: true,
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Coldheart Poison',
					description: 'DoT that reduces healing by 30% (Vayr\'s Legacy)',
					dispellable: true,
					damageType: 'nature',
					priority: 'high'
				}
			]
		},
		{
			id: 'eldrin-chronomancer',
			name: 'Eldrin Chronomancer',
			score: 5,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Erosion of Time',
					description: 'Debuffs player with damage over time',
					dispellable: true,
					damageType: 'magic',
					priority: 'medium'
				},
				{
					name: 'Decrepify',
					description: 'Channels on target dealing high damage over time. PRIORITY interrupt',
					interruptible: true,
					damageType: 'shadow',
					priority: 'high'
				},
				{
					name: 'Temporal Manipulation',
					description: 'Creates area where NPCs gain increased attack speed. PRIORITY interrupt',
					interruptible: true,
					priority: 'high'
				}
			],
			notes: 'Must interrupt Decrepify and Temporal Manipulation'
		},
		{
			id: 'tundra-stalker',
			name: 'Tundra Stalker',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Shoot',
					description: 'Basic ranged physical damage',
					damageType: 'physical',
					priority: 'low'
				},
				{
					name: 'Rapid Fire',
					description: 'Channels volley of arrows in a cone',
					damageType: 'physical',
					priority: 'medium'
				}
			]
		},
		{
			id: 'apostate-veras',
			name: 'Apostate Veras',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Icy Death',
					description: 'Slams tank for large damage. 2s cast',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Howling Blast',
					description: 'Wide frontal on tank dealing major damage',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Glacial Spikes',
					description: 'Icicles attack targeted ally from ground every 6s',
					damageType: 'magic',
					priority: 'medium'
				},
				{
					name: 'Splintering Ice',
					description: 'Magic debuff that fires icicles in all directions when dispelled. Huge damage if expires',
					dispellable: true,
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Frigid Mists',
					description: 'TOP PRIORITY interrupt',
					interruptible: true,
					priority: 'high'
				}
			],
			notes: 'Interrupt Frigid Mists at all costs'
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Apostate Veras',
			enemyId: 'apostate-veras'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
