import { z } from 'zod';
import { channelListItemSchema } from '../../entities/channel.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const inputSchema = z.object({}).strict();
export const outputSchema = z.object({ channels: z.array(channelListItemSchema) }).strict();
export const definition = {
  title: 'List channels',
  description: 'List visible channels and active threads with server, parent, and category metadata.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
