import { z } from 'zod';
import { attachmentSchema } from '../../entities/attachment.js';

export const MAX_BYTES = 10 * 1024 * 1024;
export const inputSchema = z.object({
  channelId: z.string().describe('Containing channel.'),
  messageId: z.string().describe('Containing message.'),
  attachmentId: z.string().describe('ID from attachments or forwardedMessages.attachments.'),
}).strict();
export const outputSchema = z.object({ attachment: attachmentSchema }).strict();
export const definition = {
  description: `Read an attachment. Images and text are returned inline; binary files and files over ${MAX_BYTES / (1024 * 1024)}MB return metadata.`,
  inputSchema,
  outputSchema,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;
