import type { Dungeon } from '../types';

export const silkenHollow: Dungeon = {
	id: 'silken-hollow',
	name: 'Silken Hollow',
	slug: 'silken-hollow',
	type: 'adventure',
	requiredScore: 120,
	timeLimit: 720,
	enemies: [
		{
			id: 'facestabber-hollow',
			name: 'Facestabber',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Stab Yer Face!',
					description: 'Teleports to random player and channels damage into them',
					interruptible: true,
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Throw Knife',
					description: 'Targets tank with additional damage',
					damageType: 'physical',
					priority: 'medium'
				}
			],
			notes: 'Use CC to stop channel, provide extra healing'
		},
		{
			id: 'frenzied-looter',
			name: 'Frenzied Looter',
			score: 2,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Gold Drop',
					description: 'Drops gold piles that grant stacking damage buff but also slow',
					priority: 'low'
				}
			],
			notes: 'Pick up gold for damage buff (beware of slow)'
		},
		{
			id: 'bully-basher-hollow',
			name: 'Bully Basher',
			score: 4,
			stunnable: false,
			ccImmune: true,
			type: 'trash',
			abilities: [
				{
					name: 'Bully Bash',
					description: 'Targets tank',
					damageType: 'physical',
					priority: 'medium'
				},
				{
					name: 'Together Stronk!',
					description: 'Buffs nearby allies reducing damage taken by 20% (Vayr\'s Legacy)',
					interruptible: true,
					priority: 'high'
				}
			],
			notes: 'Must interrupt Together Stronk!'
		},
		{
			id: 'venom-drinker',
			name: 'Venom Drinker',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Venom Bolt',
					description: 'Targets tank',
					interruptible: true,
					damageType: 'nature',
					priority: 'medium'
				},
				{
					name: 'Poisonado',
					description: 'Chases tank applying Necrotic Venom stacks (Vayr\'s Legacy)',
					interruptible: true,
					priority: 'high'
				}
			],
			notes: 'CC Poisonado or have tank kite in melee while avoiding allies'
		},
		{
			id: 'gravesnare-kidnapper',
			name: 'Gravesnare Kidnapper',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: [
				{
					name: 'Kidnap',
					description: 'Must be interrupted',
					interruptible: true,
					priority: 'high'
				}
			]
		},
		{
			id: 'rotheart-recluse',
			name: 'Rotheart Recluse',
			score: 3,
			stunnable: true,
			type: 'trash',
			abilities: []
		},
		{
			id: 'vexira',
			name: 'Vexira, Mother of Nightmares',
			score: 0,
			stunnable: false,
			type: 'boss',
			abilities: [
				{
					name: 'Fang Strike',
					description: 'Powerful strike on tank dealing high damage',
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: 'Tethering Webs',
					description: 'Binds 2 players together. Run apart to snap tether or become stunned',
					priority: 'high'
				},
				{
					name: 'Devour',
					description: 'Massive damage if tethered players don\'t break web (Vayr\'s Legacy +4)',
					damageType: 'physical',
					priority: 'high'
				},
				{
					name: "Mother's Milk",
					description: 'Buffs remaining adds and applies stacking party DoT',
					dispellable: true,
					priority: 'high'
				},
				{
					name: 'Call Children',
					description: 'Summons Rotheart Recluse or Gravesnare Kidnapper',
					priority: 'medium'
				}
			],
			notes: 'Don\'t touch green circles! Run away during Tethering Webs. Tank keep defensives up for Fang Strike'
		}
	],
	enemyPositions: [],
	bosses: [
		{
			name: 'Vexira, Mother of Nightmares',
			enemyId: 'vexira'
		}
	],
	mapDimensions: {
		width: 1000,
		height: 1000
	}
};
