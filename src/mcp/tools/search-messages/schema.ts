import { z } from 'zod';
import type { SearchResult } from '../../../discord/search.js';
import { searchHitSchema } from '../../entities/message.js';
import { READ_ONLY_TOOL_ANNOTATIONS } from '../annotations.js';

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 25;
export const inputSchema = z.object({
  content: z.string().optional().describe('Text and file names; quote an exact phrase.'),
  channelId: z.string().optional().describe('Channel to search.'),
  authorId: z.string().optional().describe('Message author.'),
  mentions: z.string().optional().describe('Mentioned user.'),
  has: z.array(z.enum(['link', 'embed', 'file', 'image', 'video', 'sound', 'sticker']))
    .optional().describe('Required content types.'),
  pinned: z.boolean().optional().describe('Pinned state.'),
  minId: z.string().optional().describe('After this message ID or ISO 8601 time.'),
  maxId: z.string().optional().describe('Before this message ID or ISO 8601 time.'),
  sortBy: z.enum(['relevance', 'timestamp']).optional().describe('Default: relevance.'),
  sortOrder: z.enum(['asc', 'desc']).optional().describe('Default: desc.'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional()
    .describe(`Page size. Default: ${DEFAULT_LIMIT}.`),
  offset: z.number().int().min(0).max(9975).optional().describe('Result offset. Default: 0.'),
}).strict();
export const outputSchema = z.object({ messages: z.array(searchHitSchema) }).strict();
export const definition = {
  title: 'Search messages',
  description: 'Search Discord\'s message index. Returns compact hits; use get_message for full data. Recent messages may not be indexed yet.',
  inputSchema,
  outputSchema,
  annotations: READ_ONLY_TOOL_ANNOTATIONS,
};
export type Input = z.input<typeof inputSchema>;
export type Output = z.output<typeof outputSchema>;

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
    : false;
type Assert<T extends true> = T;
export type OutputMatchesSearchResult = Assert<Equal<Output, SearchResult>>;
