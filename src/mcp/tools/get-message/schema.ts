import { z } from 'zod';
import { fullMessageSchema } from '../../entities/message.js';

export const inputSchema = z.object({
  channelId: z.string().describe('Containing channel.'),
  messageId: z.string().describe('Message to read.'),
}).strict();
export const outputSchema = z.object({ message: fullMessageSchema }).strict();
export const definition = {
  description: 'Read one message with full embeds, polls, forwards, and reply preview.',
  inputSchema,
  outputSchema,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
