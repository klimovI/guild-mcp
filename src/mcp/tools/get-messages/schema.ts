import { z } from 'zod';
import { compactMessageSchema } from '../../entities/message.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const inputSchema = z.object({
  channelId: z.string().describe('Channel or thread.'),
  before: z.string().optional().describe('Before this message ID or ISO 8601 time.'),
  after: z.string().optional().describe('After this message ID or ISO 8601 time.'),
  around: z.string().optional()
    .describe('Center on this message ID or ISO 8601 time; excludes before and after.'),
  limit: z.number().int().positive().max(MAX_LIMIT).optional()
    .describe(`Page size. Default: ${DEFAULT_LIMIT}.`),
}).strict();
export const outputSchema = z.object({ messages: z.array(compactMessageSchema) }).strict();
export const definition = {
  title: 'Read messages',
  description: 'Read channel or thread messages, newest first. Returns compact messages.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
