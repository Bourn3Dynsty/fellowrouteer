import type { Dungeon } from '../types';

export const stormwatch: Dungeon = {
	id: 'stormwatch',
	name: 'Stormwatch',
	slug: 'stormwatch',
	type: 'adventure',
	requiredScore: 155,
	timeLimit: 900,
	enemies: [
		{
			id: 'mancatcher',
			name: 'Mancatcher',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Grip',
					description: 'Yanks a ranged player into melee range, dealing damage and applying a slow',
					priority: 'medium'
				}
			],
			notes: 'Ranged players should stay within 15 yards to avoid Grip'
		},
		{
			id: 'raging-pillager',
			name: 'Raging Pillager',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Blood Frenzy',
					description: 'Gains stacking buff when nearby enemies die, increasing haste, damage, and health',
					priority: 'high'
				}
			],
			notes: 'Kill last or control to prevent stacks'
		},
		{
			id: 'profane-invoker',
			name: 'Profane Invoker',
			score: 4,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Shadow Bolt',
					description: 'Sends a bolt of shadow dealing magic damage',
					interruptible: true,
					damageType: 'shadow',
					priority: 'low'
				},
				{
					name: 'Wither',
					description: 'Applies a high damage DoT',
					interruptible: true,
					dispellable: true,
					damageType: 'magic',
					priority: 'high'
				}
			],
			notes: 'Interrupt Wither first on Adept+ difficulty'
		},
		{
			id: 'bully-basher',
			name: 'Bully Basher',
			score: 4,
			stunnable: true,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Bully Bash',
					description: 'Targets the tank with heavy damage',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Together Stronk!',
					description: 'Applies 20% damage reduction to all nearby mobs',
					interruptible: true,
					priority: 'high'
				}
			],
			notes: 'Must interrupt Together Stronk! - gives 20% DR to entire pack'
		},
		{
			id: 'facestabber',
			name: 'Facestabber',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Stab Yer Face!',
					description: 'Attaches to a random player dealing continuous damage with stacking debuffs. Removed when healed to full.',
					priority: 'high'
				}
			]
		},
		{
			id: 'executioner',
			name: 'Executioner',
			score: 5,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: "Executioner's Cleave",
					description: 'Massive frontal cleave applying stacking debuff: +5% damage taken per stack',
					damageType: 'physical',
					priority: 'high'
				}
			],
			notes: 'Most dangerous trash mob. Immune to CC but moves slowly. Tank face away from group.'
		},
		{
			id: 'ashen-arsonist',
			name: 'Ashen Arsonist',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Flame Blast',
					description: 'Frontal cone dealing large damage to players caught in the blast',
					damageType: 'fire',
					priority: 'medium'
				},
				{
					name: 'Big Oogha Flame',
					description: 'Large fire damage ability',
					interruptible: true,
					damageType: 'fire',
					priority: 'high'
				}
			],
			notes: 'Interrupt Big Oogha Flame on Adept+'
		},
		{
			id: 'nightmist-cutthroat',
			name: 'Nightmist Cutthroat',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Backstab',
					description: 'Teleports behind tank to attempt a powerful backstab attack',
					damageType: 'physical',
					priority: 'medium'
				}
			]
		},
		{
			id: 'dire-rat',
			name: 'Dire Rat',
			score: 1,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Frenzy',
					description: 'At 50% health, fixates on an enemy and gains 50% increased haste and life steal',
					priority: 'medium'
				}
			]
		},
		{
			id: 'stormscreamer',
			name: 'Stormscreamer',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Sky Zapper',
					description: 'Lightning damage ability',
					interruptible: true,
					damageType: 'nature',
					priority: 'high'
				},
				{
					name: 'Ball Lightning',
					description: 'Projectile that can be sidestepped',
					priority: 'low'
				}
			]
		},
		{
			id: 'shinchopper',
			name: 'Shinchopper',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: []
		},
		{
			id: 'warlord-brogg',
			name: 'Warlord Brogg',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: []
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Warlord Brogg',
			enemyId: 'warlord-brogg'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
