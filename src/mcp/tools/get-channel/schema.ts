import { z } from 'zod';
import { channelSchema } from '../../entities/channel.js';

export const inputSchema = z.object({
  channelId: z.string().describe('Channel or thread to read.'),
}).strict();
export const outputSchema = z.object({ channel: channelSchema }).strict();
export const definition = {
  description: 'Read channel or thread metadata. Threads include parent and starter message IDs.',
  inputSchema,
  outputSchema,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
