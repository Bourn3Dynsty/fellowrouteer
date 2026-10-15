import { getDungeon } from '$lib/data/dungeons';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const dungeon = getDungeon(params.slug);

	if (!dungeon) {
		throw error(404, 'Dungeon not found');
	}

	return {
		dungeon
	};
};
