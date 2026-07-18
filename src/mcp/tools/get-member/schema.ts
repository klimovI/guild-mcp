import { z } from 'zod';
import { memberSchema } from '../../entities/member.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const inputSchema = z.object({
  userId: z.string().describe('User to read.'),
  guildId: z.string().optional().describe('Server to check.'),
}).strict();
export const outputSchema = memberSchema.strict();
export const definition = {
  title: 'Read member',
  description: 'Read a user profile and membership details for shared servers.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
