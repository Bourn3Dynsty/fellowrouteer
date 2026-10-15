import type { Route } from '../types';

export type { Route };

export const premadeRoutes: Route[] = [
	{
		id: 'stormwatch-efficient-1',
		name: 'Stormwatch Efficient Route',
		dungeonId: 'stormwatch',
		difficulty: 4,
		totalScore: 155,
		author: 'Community',
		createdAt: new Date('2026-01-15'),
		updatedAt: new Date('2026-01-15'),
		pulls: [
			{
				id: '1',
				name: 'Opening Pull',
				enemies: ['profane-invoker', 'bully-basher', 'mancatcher'],
				totalScore: 10,
				color: '#667eea',
				efficiency: 'good'
			},
			{
				id: '2',
				name: 'Executioner Pack',
				enemies: ['executioner', 'facestabber', 'dire-rat'],
				totalScore: 8,
				color: '#f093fb',
				efficiency: 'excellent'
			},
			{
				id: '3',
				name: 'Mixed Trash',
				enemies: ['raging-pillager', 'raging-pillager', 'shinchopper', 'shinchopper'],
				totalScore: 8,
				color: '#43e97b',
				efficiency: 'average'
			},
			{
				id: '4',
				name: 'Caster Heavy',
				enemies: ['profane-invoker', 'stormscreamer', 'ashen-arsonist'],
				totalScore: 10,
				color: '#feca57',
				efficiency: 'good'
			},
			{
				id: '5',
				name: 'Final Trash',
				enemies: ['nightmist-cutthroat', 'nightmist-cutthroat', 'bully-basher', 'dire-rat'],
				totalScore: 11,
				color: '#f5576c',
				efficiency: 'good'
			}
		]
	},
	{
		id: 'wyrmheart-speed-1',
		name: 'Wyrmheart Speed Route',
		dungeonId: 'wyrmheart',
		difficulty: 5,
		totalScore: 109,
		author: 'Top Player',
		createdAt: new Date('2026-02-01'),
		updatedAt: new Date('2026-02-01'),
		pulls: [
			{
				id: '1',
				name: 'Chronomancer Focus',
				enemies: ['eldrin-chronomancer', 'tundra-stalker', 'tundra-stalker'],
				totalScore: 9,
				color: '#667eea',
				efficiency: 'excellent'
			},
			{
				id: '2',
				name: 'Scholar Pack',
				enemies: ['deceitful-scholar', 'blade-of-cithrel', 'coldheart-assassin'],
				totalScore: 10,
				color: '#764ba2',
				efficiency: 'good'
			},
			{
				id: '3',
				name: 'Blade Heavy',
				enemies: ['blade-of-cithrel', 'blade-of-cithrel', 'tundra-stalker'],
				totalScore: 8,
				color: '#4facfe',
				efficiency: 'good'
			}
		]
	},
	{
		id: 'sailors-safe-1',
		name: "Sailor's Abyss Safe Route",
		dungeonId: 'sailors-abyss',
		difficulty: 3,
		totalScore: 131,
		author: 'Community',
		createdAt: new Date('2026-01-20'),
		updatedAt: new Date('2026-01-20'),
		pulls: [
			{
				id: '1',
				name: 'Water Elemental + Support',
				enemies: ['water-elemental', 'witchreef-lasher', 'witchreef-lasher'],
				totalScore: 8,
				color: '#667eea',
				efficiency: 'good'
			},
			{
				id: '2',
				name: 'Spectre Focus',
				enemies: ['tormented-spectre', 'vengeful-shade', 'fading-raider'],
				totalScore: 9,
				color: '#f093fb',
				efficiency: 'excellent'
			},
			{
				id: '3',
				name: 'Corsair Pack',
				enemies: ['hollowed-corsair', 'vengeful-shade', 'vengeful-shade'],
				totalScore: 10,
				color: '#43e97b',
				efficiency: 'average'
			},
			{
				id: '4',
				name: 'Magi Priority',
				enemies: ['deepbound-magi', 'witchreef-lasher', 'fading-raider'],
				totalScore: 8,
				color: '#feca57',
				efficiency: 'good'
			}
		]
	}
];

export function getPremadeRoutes(dungeonId: string): Route[] {
	return premadeRoutes.filter((route) => route.dungeonId === dungeonId);
}

export function getAllPremadeRoutes(): Route[] {
	return premadeRoutes;
}
