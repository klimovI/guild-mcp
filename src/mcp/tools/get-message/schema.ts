import { z } from 'zod';
import { fullMessageSchema } from '../../entities/message.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const inputSchema = z.object({
  channelId: z.string().describe('Containing channel.'),
  messageId: z.string().describe('Message to read.'),
}).strict();
export const outputSchema = z.object({ message: fullMessageSchema }).strict();
export const definition = {
  title: 'Read message',
  description: 'Read one message with full embeds, polls, forwards, and reply preview.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
