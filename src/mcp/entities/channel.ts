import { z } from 'zod';
import { enumName, isoTimestamp, nullableIsoTimestamp, nullableString } from './common.js';

export const channelSchema = z.strictObject({
  id: z.string(),
  guildId: z.string(),
  name: z.string(),
  type: enumName,
  parentId: nullableString.describe('Category for a channel; parent channel for a thread.'),
  topic: nullableString.optional(),
  ownerId: nullableString.optional(),
  starterMessageId: z.string().optional().describe('Message that started the thread.'),
  archived: z.boolean().nullable().optional(),
  locked: z.boolean().nullable().optional(),
  archiveTimestamp: nullableIsoTimestamp.optional(),
  autoArchiveDuration: z.number().nullable().optional(),
  messageCount: z.number().nullable().optional(),
  memberCount: z.number().nullable().optional(),
});

export const threadSchema = z.strictObject({
  id: z.string(),
  parentId: nullableString.describe('Parent channel or forum.'),
  name: z.string(),
  ownerId: nullableString,
  createdAt: isoTimestamp.nullable(),
  archived: z.boolean().nullable(),
  archivedAt: nullableIsoTimestamp,
  locked: z.boolean().nullable(),
  autoArchiveDuration: z.number().nullable(),
  messageCount: z.number().nullable(),
  memberCount: z.number().nullable(),
});

export const channelListItemSchema = z.strictObject({
  id: z.string(),
  guildId: z.string(),
  guildName: z.string(),
  name: z.string(),
  type: enumName,
  parentId: nullableString.describe('Immediate parent.'),
  categoryName: nullableString.describe('Enclosing category.'),
});

export type ChannelOutput = z.output<typeof channelSchema>;
export type ThreadOutput = z.output<typeof threadSchema>;
export type ChannelListItem = z.output<typeof channelListItemSchema>;
