import type { Dungeon } from '../types';

export const everdawnGrove: Dungeon = {
	id: 'everdawn-grove',
	name: 'Everdawn Grove',
	slug: 'everdawn-grove',
	type: 'adventure',
	requiredScore: 125,
	timeLimit: 720,
	enemies: [
		{
			id: 'blighted-dawnbloom',
			name: 'Blighted Dawnbloom',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Blighted Ichor',
					description: 'Damages random party member and nearby allies, applying high damage stacking DoT',
					damageType: 'nature',
					priority: 'high'
				},
				{
					name: 'Glory',
					description: 'On death, creates healing circle (heals enemies and allies)',
					priority: 'medium'
				}
			],
			notes: 'Tank should move enemies out of healing circles'
		},
		{
			id: 'skittershard-grove',
			name: 'Skittershard',
			score: 1,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Crystalline Corruption',
					description: 'On death, party-wide stacking DoT. 1 stack removed per heal (Adept+)',
					dispellable: true,
					priority: 'high'
				}
			]
		},
		{
			id: 'desecrator',
			name: 'Desecrator',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Volley',
					description: 'Channels barrage creating damage circles under random players',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Infernal Explosive',
					description: 'Bomb near random player. Heavy party damage if no one in circle (Adept+)',
					damageType: 'fire',
					priority: 'high'
				}
			],
			notes: 'Someone must soak Infernal Explosive'
		},
		{
			id: 'mangy-brute',
			name: 'Mangy Brute',
			score: 1,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Bash',
					description: 'Medium damage to target',
					damageType: 'physical',
					priority: 'low'
				}
			]
		},
		{
			id: 'corrupted-totemic',
			name: 'Corrupted Totemic',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Shadow Lob',
					description: 'Random player high damage attack. PRIORITY interrupt',
					interruptible: true,
					damageType: 'shadow',
					priority: 'high'
				},
				{
					name: 'Restoration',
					description: 'After 3s, restores health to self',
					interruptible: true,
					priority: 'high'
				},
				{
					name: 'Bloodstone Totem',
					description: 'Summons totem casting party-wide damage (cannot be interrupted)',
					priority: 'high'
				},
				{
					name: 'Corrupted Prayer',
					description: 'Ground effects that stun and deal heavy damage (Adept+)',
					priority: 'high'
				}
			],
			notes: 'Kill totems ASAP - their Corruption cannot be interrupted'
		},
		{
			id: 'outrunner',
			name: 'Outrunner',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Bola Throw',
					description: 'Random target moderate damage and slow',
					damageType: 'physical',
					priority: 'low'
				},
				{
					name: 'Charge',
					description: 'Charges distant target for moderate damage and knockup (Adept+)',
					damageType: 'physical',
					priority: 'medium'
				}
			]
		},
		{
			id: 'malgut-fetid',
			name: 'Malgut the Fetid',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Umbral Eruption',
					description: 'Covers arena in corruption, heavy damage to anyone caught (including Akari)',
					damageType: 'shadow',
					priority: 'high'
				},
				{
					name: 'Crystal Volley',
					description: 'Cone attack on all 4 players. Damages Akari if hit',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Godrot Eclipse',
					description: 'Channels pulsing party damage until Akari interrupts',
					priority: 'high'
				},
				{
					name: 'Bloodstone Totem',
					description: 'Spawns totem with uninterruptible Corruption',
					priority: 'high'
				},
				{
					name: 'Corrupting Shot',
					description: 'DoT that deals large damage on expiry/dispel, split among nearby players',
					dispellable: true,
					damageType: 'shadow',
					priority: 'high'
				}
			],
			notes: 'Need Akari\'s help to knock boss over and interrupt abilities'
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Malgut the Fetid',
			enemyId: 'malgut-fetid'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
