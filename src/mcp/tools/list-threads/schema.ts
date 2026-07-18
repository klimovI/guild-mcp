import { z } from 'zod';
import { threadSchema } from '../../entities/channel.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const inputSchema = z.object({
  channelId: z.string().optional().describe('Parent channel or forum; omit for all active threads.'),
  before: z.string().optional().describe('Archived before this ISO 8601 time; requires channelId.'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Archive page size. Default: 50.'),
}).strict().refine((args) => args.before === undefined || args.channelId !== undefined, {
  message: 'before requires channelId',
  path: ['before'],
});
export const outputSchema = z.object({ threads: z.array(threadSchema), hasMore: z.boolean() }).strict();
export const definition = {
  title: 'List threads',
  description: 'List active threads across servers, or active and public archived threads in one parent.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
