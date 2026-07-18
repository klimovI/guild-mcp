import { z } from 'zod';
import { nullableIsoTimestamp, nullableString } from './common.js';

const membershipSchema = z.strictObject({
  guildId: z.string(),
  guildName: z.string(),
  nickname: nullableString,
  displayName: z.string(),
  roles: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  joinedAt: nullableIsoTimestamp,
});

export const memberSchema = z.strictObject({
  id: z.string(),
  username: z.string().describe('@handle.'),
  globalName: nullableString.describe('Account display name.'),
  bot: z.boolean(),
  memberships: z.array(membershipSchema),
});

export const memberListItemSchema = z.strictObject({
  id: z.string(),
  username: z.string().describe('@handle.'),
  globalName: nullableString.describe('Account display name.'),
  nickname: nullableString.describe('Name on this server.'),
  bot: z.boolean(),
  guildId: z.string(),
  guildName: z.string(),
});

export type MemberOutput = z.output<typeof memberSchema>;
export type MemberListItem = z.output<typeof memberListItemSchema>;
