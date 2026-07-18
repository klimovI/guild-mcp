import { z } from 'zod';

export const nullableString = z.string().nullable();
export const enumName = z.union([z.string(), z.number()]);
export const isoTimestamp = z.iso.datetime({ offset: true }).describe('ISO 8601 timestamp.');
export const nullableIsoTimestamp = isoTimestamp.nullable();
