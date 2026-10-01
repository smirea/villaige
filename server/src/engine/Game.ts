import type { Action, Cost, Villager } from 'server/types';
import getActions from './getActions';
import textBlock from 'shared/textBlock';
import { formatTime } from './utils';
import { stringify } from 'javascript-stringify';
import z from 'zod';
import { Output, stepCountIs, streamText } from 'ai';
import chalk from 'chalk';
import * as _ from 'es-toolkit/compat';
import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';

interface Conversation {
	time: number;
	from: Villager['name'];
	to: Villager['name'];
	message: string;
}

export default class Game {
	data = {
		date: 'Monday',
		time: 9 * 60,
		villagers: [
			{
				name: 'Bob' as any,
				memory: `I am a farmer, I work for John. My wage is 1silver/day. I'm married to Marie. My goal for today is to bring Marie a clay pot`,
				location: 'home',
				nextActionTime: 9 * 60,
				stats: {
					energy: 100,
					health: 80,
					money: 120,
				},
				actionHistory: [],
				inventory: {},
			},
		] as Villager[],
		conversations: [] as Conversation[],
	};

	getNearby(name: Villager['name']) {
		const villager = this.getVillager(name);
		const locations = Object.groupBy(
			this.data.villagers.filter(v => v.name !== villager.name),
			v => v.location,
		);

		return locations[villager.location] || [];
	}

	talk(conversion: Omit<Conversation, 'time'>) {
		this.data.conversations.push({ time: this.data.time, ...conversion });
	}

	getVillager(name: string) {
		const found = this.data.villagers.find(x => x.name === name);
		if (!found) throw new Error(`Villager '${name}' not found`);
		return found;
	}

	async tick() {
		const printHeader = _.once(() =>
			console.log(
				chalk.bold(`\n――― (tick: ${this.data.time}) ${this.data.date} ${formatTime(this.data.time)} `.padEnd(100, '―')),
			),
		);
		for (const villager of this.data.villagers.filter(v => v.nextActionTime === this.data.time)) {
			printHeader();
			console.group(villager.name);
			console.log(chalk.bold('memory:'), villager.memory);
			const msg = this.compileNextMessage(villager);
			console.log(chalk.bold(`actions (${msg.actions.length}):`), msg.actions.map(x => x.name).join(', '));
			const { args, action } = await this.invokeAi(msg);
			const a = msg.actions.find(x => x.name === action)!;
			const finalCost = compileCost(a, args as any);
			villager.statusMessage = await a.run(args || ({} as any));
			villager.actionHistory.push({ time: this.data.time, action: a.name, args: args || undefined });
			for (const [_k, v] of Object.entries(finalCost)) {
				const k = _k as keyof typeof finalCost;
				if (k === 'time') {
					if (!v) throw new Error('time=0 should never happen');
					villager.nextActionTime = this.data.time + (v as number);
					continue;
				}
				if (k === 'inventory') {
					for (const [item, count] of Object.entries(v as Record<string, number>)) {
						villager.inventory[item] -= count;
						if (!villager.inventory[item]) delete villager.inventory[item];
					}
					continue;
				}
				villager.stats[k] -= v as number;
			}
			console.groupEnd();
		}

		// for (const c of this.data.conversations) {
		// }

		++this.data.time;
	}

	async invokeAi({ system, messages, actions }: ReturnType<typeof this.compileNextMessage>) {
		// const result = { action: null as null | string, args: null as any };
		console.log(messages.map(m => `― ${m}`).join('\n'));
		const stream = streamText({
			model: google('gemini-3-flash-preview'),
			// model: groq('openai/gpt-oss-20b'),
			// model: groq('llama-3.1-8b-instant'),
			output: Output.object({
				schema: z.object({
					next: z.union(
						actions.map(a =>
							z.strictObject({
								action: z.literal(a.name),
								...(_.isEmpty(a.args) ? {} : { args: z.strictObject(a.args) }),
							}),
						),
					),
				}),
			}),
			maxOutputTokens: 1000,
			stopWhen: stepCountIs(1),
			// tools: Object.fromEntries(
			// 	actions.map(a => [
			// 		a.name,
			// 		{
			// 			inputSchema: z.strictObject(a.args),
			// 			description: a.description,
			// 		} satisfies Tool,
			// 	]),
			// ),
			temperature: 1,
			providerOptions: {
				google: {
					// reasoningEffort: 'medium',
					thinkingConfig: {
						includeThoughts: true,
						thinkingBudget: 0,
						// thinkingLevel: 'minimal',
					},
				} satisfies GoogleLanguageModelOptions,
			},
			system,
			messages: messages.map(x => ({ role: 'assistant', content: x })),
		});

		for await (const part of stream.fullStream) {
			switch (part.type) {
				// case 'tool-call':
				// 	if (!result.action) {
				// 		console.log(
				// 			chalk.bold('⭘ %s:'),
				// 			chalk.cyan(part.toolName),
				// 			util.inspect(part.input, { colors: true, compact: true }),
				// 		);
				// 		result.action = part.toolName;
				// 		result.args = part.input;
				// 	}
				// 	break;
				case 'reasoning-start':
					process.stdout.write(chalk.yellow('\n<reasoning>\n'));
					break;
				case 'reasoning-delta':
					process.stdout.write(chalk.yellow(part.text));
					break;
				case 'reasoning-end':
					process.stdout.write(chalk.yellow('\n</reasoning>\n'));
					break;
				case 'text-delta':
					process.stdout.write(chalk.green(part.text));
					break;
				case 'text-end':
					process.stdout.write('\n');
					break;
				default:
				// noop
			}
		}

		await stream.response;

		return (await stream.output).next;

		// if (!result.action) throw new Error('did not call an action');

		// return result as { action: string; args: Record<string, any> };
	}

	compileNextMessage(villager: Villager) {
		const allActions = getActions(this, villager);
		const actions: typeof allActions = [];
		const invalidActions: Array<[Action<any>, string]> = [];

		for (const action of allActions) {
			const issues: string[] = [];
			const finalCost = compileCost(action);

			for (const [_k, v] of Object.entries(finalCost)) {
				const k = _k as keyof typeof finalCost;
				if (k === 'time') continue;
				if (k === 'inventory') {
					for (const [item, count] of Object.entries(v)) {
						const have = villager.inventory[item];
						if (!have) issues.push(`I need ${count} ${item}`);
						else if (have < count) issues.push(`I need ${count - have} more ${item}`);
					}
					continue;
				}
				if (villager.stats[k] < (v as number)) issues.push(`I need ${v} ${k}`);
			}

			if (issues.length) {
				invalidActions.push([action, issues.join(' and ')]);
			} else {
				actions.push(action);
			}
		}

		return {
			actions,
			invalidActions,
			system: textBlock`
				You are ${villager.name}, a villager in a mythical town. Your goal is to live as if ${villager.name} would live.
				You behave exactly as ${villager.name}, you are one and the same. You refer to yourself as ${villager.name}, you talk in the first person and you think as ${villager.name} in the first person.
				You must reply with exactly a single tool call. You will receive feedback afterwards

				Today is ${this.data.date}
			`,
			messages: [
				[
					textBlock`
						I recall: ${villager.memory}
					`,
					textBlock`
						I have ${Math.floor(villager.stats.money / 100)} silver ${villager.stats.money % 100} copper
						My health is ${villager.stats.health}
						My energy is ${villager.stats.energy}
						It's ${formatTime(this.data.time)}
						My location is ${villager.location}
						Around me there is ${this.getNearby(villager.name).join(', ') || 'nobody'}
					`,
					// villager.actionHistory.length &&
					textBlock`
							Today I:
							- 9:00 AM: woke up
							${villager.actionHistory.map(x => `- ${formatTime(x.time)}: ${x.action}(${x.args ? stringify(x.args) : ''})`) || 'nothing yet'}
						`,
					Object.keys(villager.inventory).length &&
						textBlock`
							I have on me: ${Object.entries(villager.inventory)
								.map(([k, v]) => (v === 1 ? k : `${v} × ${k}`))
								.join(', ')}
						`,
					invalidActions.length &&
						invalidActions.map(([{ name }, message]) => `I can't ${name} because ${message}`).join('\n'),
				]
					.filter(x => x && x.trim())
					.join('\n\n'),
			],
		};
	}
}

function compileCost<Args extends Record<string, any>>(action: Action<Args>, args?: Args): Cost {
	if (action.cost.type === 'constant') {
		const { type: _, ...rest } = action.cost;
		return rest;
	}

	return action.cost.fn(z.object(action.args).parse(args || action.cost.baseArgs));
}
