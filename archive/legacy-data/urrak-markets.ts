import type { Dungeon } from '../types';

export const urrakMarkets: Dungeon = {
	id: 'urrak-markets',
	name: 'Urrak Markets',
	slug: 'urrak-markets',
	type: 'adventure',
	requiredScore: 160,
	timeLimit: 780,
	enemies: [
		{
			id: 'slavebind-totem',
			name: 'Slavebind Totem',
			score: 1,
			stunnable: false,
			type: 'trash',
			abilities: [],
			notes: 'Guarded by nearby enemies. Destroy for Breaker of Chains buff (+30% CDR)'
		},
		{
			id: 'outrunner-markets',
			name: 'Outrunner',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Bola Throw',
					description: 'Moderate damage and slow',
					damageType: 'physical',
					priority: 'low'
				},
				{
					name: 'Charge',
					description: 'Knocks up targets further than 10 yards (Adept+)',
					damageType: 'physical',
					priority: 'medium'
				}
			]
		},
		{
			id: 'urrak-slaver',
			name: 'Urrak Slaver',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Bloodlash Wake',
					description: 'AoE circle dealing moderate damage',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Barbed Chain',
					description: 'Connects two players - increased damage the further apart they are (Adept+)',
					interruptible: true,
					priority: 'high'
				}
			],
			notes: 'Priority interrupt Barbed Chain'
		},
		{
			id: 'mancatcher-markets',
			name: 'Mancatcher',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Grip',
					description: 'Pulls random party member more than 10 yards away, applying slow',
					priority: 'medium'
				}
			]
		},
		{
			id: 'gorestained-butcher',
			name: 'Gorestained Butcher',
			score: 5,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Furious Tantrum',
					description: 'Channels heavy party damage every 2s over 4 seconds',
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Mince',
					description: 'Channels damage into tank (Vayr\'s Legacy)',
					damageType: 'physical',
					priority: 'high'
				}
			],
			notes: 'Tank use defensive for Mince'
		},
		{
			id: 'urrak-witch',
			name: 'Urrak Witch',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Mossfire Bolt',
					description: 'Ranged attack on tank',
					interruptible: true,
					damageType: 'fire',
					priority: 'medium'
				},
				{
					name: 'Grasping Vines',
					description: 'Creates vines under random player - DoT and temporary stun',
					damageType: 'nature',
					priority: 'medium'
				}
			]
		},
		{
			id: 'desecrator-markets',
			name: 'Desecrator',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Infernal Explosive',
					description: 'Circle that must be soaked or group takes large damage (Vayr\'s Legacy)',
					damageType: 'fire',
					priority: 'high'
				}
			],
			notes: 'Someone must soak the circle'
		},
		{
			id: 'horned-seer',
			name: 'Horned Seer',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Pain Bolt',
					description: 'Targets tank',
					interruptible: true,
					damageType: 'shadow',
					priority: 'medium'
				},
				{
					name: 'Orb of Blood',
					description: 'Shoots toward random player. Grants 20% damage for 10s if hit',
					damageType: 'shadow',
					priority: 'low'
				},
				{
					name: 'Sanguine Offering',
					description: 'PRIORITY interrupt',
					interruptible: true,
					damageType: 'shadow',
					priority: 'high'
				}
			]
		},
		{
			id: 'hellcaller',
			name: 'Hellcaller',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Restore Vitality',
					description: 'PRIORITY interrupt',
					interruptible: true,
					priority: 'high'
				},
				{
					name: 'Demonic Lash',
					description: 'PRIORITY interrupt',
					interruptible: true,
					damageType: 'shadow',
					priority: 'high'
				}
			]
		},
		{
			id: 'slavetrader-brull',
			name: 'Slavetrader Brull',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [],
			notes: 'Dual boss fight. Balance health between bosses to avoid Enrage (+2% damage per 1% health diff)'
		},
		{
			id: 'drazhul',
			name: 'Drazhul the Fleshbroker',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [],
			notes: 'Handle ricocheting scythes and ground hazards. Keep interrupts ready for high-impact casts'
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Slavetrader Brull',
			enemyId: 'slavetrader-brull'
		},
		{
			name: 'Drazhul the Fleshbroker',
			enemyId: 'drazhul'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
