import _ from 'lodash';
import Game from './engine/Game';

const game = new Game();

async function init() {
	do {
		await game.tick();
	} while (game.data.time <= 16 * 60);
	console.log('='.repeat(100));
	console.dir(game.data, { depth: null });
}

void init();
