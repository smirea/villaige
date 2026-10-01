import * as _ from 'es-toolkit';
import { type Action, type LocationName, type Villager } from 'server/types';
import type Game from './Game';
import z from 'zod';

export const locations = {
	farm: [-10, 10],
	square: [0, 0],
	home: [10, 5],
	tavern: [2, 2],
	river_bank: [0, -10],
} as const satisfies Record<string, [number, number]>;

const locationNames = Object.keys(locations) as Array<keyof typeof locations>;

const dist = (a: [number, number], b: [number, number]) =>
	Math.ceil(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2));
const locationDist = (a: LocationName, b: LocationName) => dist(locations[a], locations[b]);

export default function getActions(state: Game, villager: Villager) {
	const actions: Action<Record<string, any>>[] = [];
	const nearby = state.getNearby(villager.name);
	const add = <Shape extends Record<string, z.ZodType>>(a: Action<Shape>) => actions.push(a);

	add({
		name: 'think',
		description: 'Take some time to think, I might remember better if I reflect on them throught the day',
		args: { thoughts: z.string().describe('a quick thought') },
		cost: { type: 'constant', time: 5, energy: 2 },
		run: () => '',
	});

	add({
		name: 'rest',
		description: 'Recover some energy, pass some time. More effective the more tired you are',
		args: {
			time: z.number().min(10).max(60),
		},
		cost: { type: 'dynamic', baseArgs: { time: 10 }, fn: a => ({ time: a.time }) },
		run: ({ time }) => {
			const exponential = (coefficient: number, value: number) =>
				_.clamp((Math.E ** (coefficient * value) - 1) / (Math.E ** coefficient - 1), 0, 1);
			const deficit = _.clamp(100 - villager.stats.energy, 0, 100);
			villager.stats.energy = _.clamp(
				villager.stats.energy + Math.floor(100 * exponential(-2.5, time / 60) * exponential(1.2, deficit / 100)),
				5,
				100,
			);
			return '';
		},
	});

	for (const to of locationNames) {
		if (to === villager.location) continue;

		add({
			name: 'walk_to_' + to,
			args: {},
			cost: {
				type: 'constant',
				time: locationDist(to, villager.location),
				energy: locationDist(to, villager.location),
			},
			run: () => {
				villager.location = to;
				return '';
			},
		});
	}

	if (nearby.length) {
		add({
			name: 'talk',
			cost: {
				type: 'constant',
				time: 1,
				energy: 1,
			},
			args: {
				to: z.enum(nearby.map(x => x.name)),
				message: z.string(),
			},
			run: ({ to, message }) => {
				const self = state.getVillager(villager.name);
				const target = state.getVillager(to);
				if (self.location !== target.location) {
					return `I tried talking to ${target.name} but they left before I got the chance`;
				}
				state.talk({ from: villager.name, to, message });
				return '';
			},
		});
	}

	switch (villager.location) {
		case 'farm':
			add({
				name: 'work',
				args: {},
				cost: { type: 'constant', time: 4 * 60, energy: 50 },
				run: () => {
					villager.stats.money += 4 * 10;
					return '';
				},
			});
			break;
		case 'tavern':
			const menu = { burger: 10, beer: 5, fries: 3 };
			add({
				name: 'see_menu',
				args: {},
				cost: { type: 'constant', energy: 1, time: 1 },
				run: () =>
					Object.entries(menu)
						.map(x => `- ${x[0]}: ${x[1]} copper`)
						.join('\n'),
			});
			add({
				name: 'consume',
				args: { item: z.enum(Object.keys(menu)) },
				cost: { type: 'constant', time: 10, energy: 1 },
				run: ({ item }) => {
					const cost = menu[item as keyof typeof menu];
					villager.stats.energy = Math.min(100, villager.stats.energy + cost);
					return '';
				},
			});
			break;
		case 'river_bank':
			add({
				name: 'collect_clay',
				args: {},
				cost: { type: 'constant', energy: 10, time: 20 },
				run: () => {
					villager.inventory.clay ||= 0;
					villager.inventory.clay += 10;
					return '';
				},
			});
			break;
		case 'square':
			add({
				name: 'use_potter_wheel',
				args: {},
				cost: { type: 'constant', energy: 20, time: 60, inventory: { clay: 15 } },
				run: () => {
					villager.inventory.clay_pot ||= 0;
					++villager.inventory.clay_pot;
					return '';
				},
			});
			break;
	}

	return actions;
}
