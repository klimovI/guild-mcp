import { z } from 'zod';
import { channelListItemSchema } from '../../entities/channel.js';

export const inputSchema = z.object({}).strict();
export const outputSchema = z.object({ channels: z.array(channelListItemSchema) }).strict();
export const definition = {
  description: 'List visible channels and active threads with server, parent, and category metadata.',
  inputSchema,
  outputSchema,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
