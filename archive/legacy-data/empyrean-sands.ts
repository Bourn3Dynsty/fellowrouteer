import type { Dungeon } from '../types';

export const empyreanSands: Dungeon = {
	id: 'empyrean-sands',
	name: 'Empyrean Sands',
	slug: 'empyrean-sands',
	type: 'adventure',
	requiredScore: 130,
	timeLimit: 720,
	enemies: [
		{
			id: 'sandsworn-husk',
			name: 'Sandsworn Husk',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Fervor',
					description: 'Gains 2% haste per melee hit, stacking up to 20 times. Tanks be careful at high stacks.',
					priority: 'medium'
				}
			]
		},
		{
			id: 'dunesnare-hunter',
			name: 'Dunesnare Hunter',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Soulpiercer',
					description: 'Locks aim on a player then fires piercing projectile dealing heavy damage and reducing stats',
					dispellable: true,
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Trap',
					description: 'Places trap at random player location. Deals heavy damage and roots on contact. (Adept+)',
					priority: 'medium'
				}
			],
			notes: 'Step out of Soulpiercer telegraph to avoid stat debuff'
		},
		{
			id: 'gravebreaker-brute',
			name: 'Gravebreaker Brute',
			score: 5,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Decimate',
					description: 'Deals damage in small radius after 3 seconds',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Crescent Cleave',
					description: 'Targets random player with large cone attack dealing heavy damage and knock up (Adept+)',
					damageType: 'physical',
					priority: 'high'
				}
			],
			notes: 'Melee swings splash to anyone within 4 yards. Stay away from tank!'
		},
		{
			id: 'tombguard-reaver',
			name: 'Tombguard Reaver',
			score: 4,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Charge',
					description: 'Targets random player and charges, dealing damage and knockback to players hit',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Whirlwind',
					description: 'Targets random player and whirlwinds with reduced movement, dealing heavy damage (Adept+)',
					damageType: 'physical',
					priority: 'high'
				}
			]
		},
		{
			id: 'acolyte-of-sinnari',
			name: 'Acolyte of Sinnari',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: "Sinnari's Wrath",
					description: 'Buffs the mob to deal random target damage over 10s',
					interruptible: true,
					damageType: 'magic',
					priority: 'high'
				},
				{
					name: 'Collapsing Star',
					description: 'Random target DoT',
					dispellable: true,
					damageType: 'magic',
					priority: 'high'
				}
			],
			notes: "Priority interrupt on Sinnari's Wrath. Healers dispel Collapsing Star ASAP"
		},
		{
			id: 'sin-magir',
			name: 'Sin-Magir',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Penumbra',
					description: '7 yard radius attack, 2.5s cast. Step out-in-out in rhythm',
					priority: 'high'
				},
				{
					name: 'Lunar Soulsear',
					description: 'Tank drags the line away from allies',
					priority: 'high'
				},
				{
					name: 'Celestial Burst',
					description: 'Small explosions randomly around the arena',
					priority: 'medium'
				},
				{
					name: 'Ruinous Starfall',
					description: 'Creates Ruinous Stars. Destroy them for 5% damage buff. If they complete cast, moderate party damage',
					priority: 'high'
				}
			]
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Sin-Magir',
			enemyId: 'sin-magir'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
