import { z } from 'zod';
import { compactMessageSchema } from '../../entities/message.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const inputSchema = z.object({ channelId: z.string().describe('Channel to read.') }).strict();
export const outputSchema = z.object({ messages: z.array(compactMessageSchema) }).strict();
export const definition = {
  title: 'List pinned messages',
  description: 'List pinned messages in a channel. Returns compact messages.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
