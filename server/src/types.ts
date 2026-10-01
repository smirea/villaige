import z from 'zod';
import type { locations } from './engine/getActions';

export type LocationName = keyof typeof locations;

// export type Brand<Type extends string, Value extends string> = Value & { __brand: Type };

const villagerNameSchema = z.string().brand<'VillagerName'>();

export interface Villager {
	name: z.infer<typeof villagerNameSchema>;
	memory: string;
	nextActionTime: number;
	currentAction?: { time: number; args: Record<string, any>; action: Action<any> };
	location: LocationName;
	stats: { energy: number; health: number; money: number };
	actionHistory: Array<{ time: number; args?: Record<string, any>; action: string }>;
	statusMessage?: string;
	inventory: Record<string, number>;
}

export type Cost = { time: number; inventory?: Record<string, number> } & Partial<Villager['stats']>;

export type Action<
	Shape extends Record<string, z.ZodType>,
	Args extends z.ZodObject<Shape, z.core.$strict> = z.ZodObject<Shape, z.core.$strict>,
> = {
	name: string;
	description?: string;
	args: Shape;
	cost: ({ type: 'constant' } & Cost) | { type: 'dynamic'; baseArgs: z.input<Args>; fn: (a: z.output<Args>) => Cost };
	run: (a: z.output<Args>) => string | Promise<string>;
};
