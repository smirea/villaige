import type z from 'zod';
import { createAuxiliaryTypeStore, printNode, zodToTs } from 'zod-to-ts';

export function formatTime(time: number) {
	let s = 'AM';
	if (time >= 12 * 60) {
		s = 'PM';
		time -= 12 * 60;
	}
	let h = Math.floor(time / 60);
	h ||= 12;
	return `${h}:${(time % 60).toString().padStart(2, '0')} ${s}`;
}

export function stringifyZod(x: z.ZodType) {
	return printNode(zodToTs(x, { auxiliaryTypeStore: createAuxiliaryTypeStore() }).node, {
		noEmitHelpers: true,
		omitTrailingSemicolon: true,
	}).replace(/\n\s*/g, '');
}
