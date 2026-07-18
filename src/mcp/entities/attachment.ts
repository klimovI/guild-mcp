import { z } from 'zod';
import { nullableString } from './common.js';

export const attachmentSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  contentType: nullableString,
  size: z.number(),
  delivery: z.enum(['image', 'text', 'metadata']).describe('How the attachment was returned.'),
  note: z.string().optional(),
  url: z.string().describe('Signed URL; expires after about 24 hours.'),
});

export type AttachmentOutput = z.output<typeof attachmentSchema>;
