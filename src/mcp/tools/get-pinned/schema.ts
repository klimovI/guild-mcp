import { z } from 'zod';
import { compactMessageSchema } from '../../entities/message.js';

export const inputSchema = z.object({ channelId: z.string().describe('Channel to read.') }).strict();
export const outputSchema = z.object({ messages: z.array(compactMessageSchema) }).strict();
export const definition = {
  description: 'List pinned messages in a channel. Returns compact messages.',
  inputSchema,
  outputSchema,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
