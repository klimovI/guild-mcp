import { z } from 'zod';
import { memberListItemSchema } from '../../entities/member.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const inputSchema = z.object({
  query: z.string().describe('Name or nickname prefix.'),
  guildId: z.string().optional().describe('Server to search.'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
    .describe(`Results per server. Default: ${DEFAULT_LIMIT}.`),
}).strict();
export const outputSchema = z.object({ members: z.array(memberListItemSchema) }).strict();
export const definition = {
  title: 'Search members',
  description: 'Find members by name or nickname prefix. Returns compact profiles.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
