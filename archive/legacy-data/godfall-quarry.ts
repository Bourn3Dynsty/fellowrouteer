import type { Dungeon } from '../types';

export const godfallQuarry: Dungeon = {
	id: 'godfall-quarry',
	name: 'Godfall Quarry',
	slug: 'godfall-quarry',
	type: 'adventure',
	requiredScore: 130,
	timeLimit: 738,
	enemies: [
		{
			id: 'dredge',
			name: 'Dredge',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Throw Stone',
					description: 'Throws stone at target shortly after pull',
					damageType: 'physical',
					priority: 'medium'
				}
			],
			notes: 'Make sure tank engages first'
		},
		{
			id: 'skittershard',
			name: 'Skittershard',
			score: 1,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Crystalline Corruption',
					description: 'On death, applies stacking DoT and healing reduction to all players. Removed when healed',
					dispellable: true,
					priority: 'high'
				}
			],
			notes: 'Healers be ready after kills. Consider Mass Dispel relic'
		},
		{
			id: 'enforcer',
			name: 'Enforcer',
			score: 4,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Piercing Strike',
					description: 'Reduces tank armor by 20% for 6s',
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Reflective Shield',
					description: 'Channels toward random player. Reflects attacks after channel completes (Vayr\'s Legacy)',
					priority: 'high'
				}
			],
			notes: 'Move out of Reflective Shield channel'
		},
		{
			id: 'quarry-stalker',
			name: 'Quarry Stalker',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Poisonous Strike',
					description: 'Teleports to random player and strikes',
					interruptible: true,
					damageType: 'nature',
					priority: 'high'
				},
				{
					name: 'Agonizing Poison',
					description: 'DoT applied by Poisonous Strike',
					dispellable: true,
					damageType: 'nature',
					priority: 'medium'
				}
			],
			notes: 'CC or interrupt, or dispel the DoT'
		},
		{
			id: 'godfall-wardstone',
			name: 'Godfall Wardstone',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Searing Beam',
					description: 'Channels into random player',
					interruptible: true,
					damageType: 'fire',
					priority: 'high'
				}
			],
			notes: 'Brittle - becomes Vulnerable when interrupted or CC\'d. Focus when vulnerable'
		},
		{
			id: 'enraged-earth-elemental',
			name: 'Enraged Earth Elemental',
			score: 5,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Shatter',
					description: 'Party-wide damage with stacking damage amplification debuff',
					damageType: 'physical',
					priority: 'high'
				}
			]
		},
		{
			id: 'arcane-warden',
			name: 'Arcane Warden',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Torment',
					description: 'Targets tank for moderate damage',
					interruptible: true,
					damageType: 'magic',
					priority: 'medium'
				},
				{
					name: 'Psionic Horror',
					description: 'AoE fear around random player (Vayr\'s Legacy)',
					interruptible: true,
					priority: 'high'
				}
			]
		},
		{
			id: 'godfall-titan',
			name: 'Godfall Titan',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Arcane Surge',
					description: 'Massive lasers from hands. Purple/yellow markers. Shift between 3 positions',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Titanic Slam',
					description: 'Two golden circles appear. Party splits to soak damage. Huge party damage if not soaked',
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Summon Wardstones',
					description: 'Summons 2 Godfall Wardstones',
					priority: 'medium'
				}
			],
			notes: 'Positioning-heavy fight. Must soak Titanic Slam circles'
		},
		{
			id: 'vaerith-vorn',
			name: 'Vaerith Vorn',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Mana Bomb',
					description: '2.5s cast, 80 yard radius',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Arcane Surge',
					description: 'Beams of energy across platform',
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Magic Missiles',
					description: 'Random target moderate damage',
					damageType: 'magic',
					priority: 'medium'
				}
			]
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Godfall Titan',
			enemyId: 'godfall-titan'
		},
		{
			name: 'Vaerith Vorn',
			enemyId: 'vaerith-vorn'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
