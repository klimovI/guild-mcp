import { z } from 'zod';
import { enumName, isoTimestamp, nullableIsoTimestamp, nullableString } from './common.js';

const authorSchema = z.strictObject({
  id: z.string(),
  username: z.string().describe('@handle.'),
  globalName: nullableString.describe('Account display name.'),
  nickname: nullableString.describe('Name on this server.'),
  displayName: z.string().describe('Name shown in Discord.'),
  bot: z.boolean(),
  webhookId: nullableString,
});

const referenceSchema = z.strictObject({
  messageId: z.string(),
  channelId: z.string(),
  guildId: nullableString,
  type: enumName.describe('Default for a reply; Forward for a forwarded message.'),
  author: z.string().optional(),
  content: nullableString.optional(),
}).nullable();

const attachmentSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  contentType: nullableString,
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.number().nullable().describe('Voice-message duration in seconds.'),
  description: nullableString,
  spoiler: z.boolean(),
  url: z.string().describe('Signed URL; expires after about 24 hours.'),
});

const mentionsSchema = z.strictObject({
  everyone: z.boolean(),
  users: z.array(z.strictObject({
    id: z.string(),
    username: z.string(),
    globalName: nullableString,
  })),
  roles: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  channels: z.array(z.strictObject({ id: z.string(), name: nullableString })),
});

const interactionSchema = z.strictObject({
  commandName: z.string(),
  user: z.strictObject({ id: z.string(), username: z.string() }),
}).nullable();

const reactionSchema = z.strictObject({
  emoji: nullableString,
  emojiId: nullableString,
  imageUrl: nullableString,
  count: z.number(),
});

const stickerSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  format: enumName,
  url: z.string(),
});

const compactEmbedSchema = z.strictObject({
  type: nullableString,
  title: nullableString,
  description: nullableString,
  fields: z.number(),
  url: nullableString,
});

const componentsSchema = z.strictObject({
  count: z.number(),
  labels: z.array(z.string()),
}).nullable();

const identityShape = {
  id: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  url: z.string(),
};

const metadataShape = {
  author: authorSchema,
  createdAt: isoTimestamp,
  editedAt: nullableIsoTimestamp.describe('Last edit time; only current text is available.'),
  type: enumName,
  pinned: z.boolean(),
  flags: z.strictObject({ isVoiceMessage: z.boolean() }),
  hasThread: z.boolean(),
  threadId: nullableString.describe('Thread started by this message.'),
  threadName: nullableString,
  interaction: interactionSchema,
  mentions: mentionsSchema,
  attachments: z.array(attachmentSchema).describe('Files attached to this message.'),
  reactions: z.array(reactionSchema),
  stickers: z.array(stickerSchema),
};

export const messageCommonSchema = z.strictObject({
  ...identityShape,
  ...metadataShape,
});

export const compactMessageSchema = z.strictObject({
  ...identityShape,
  cleanContent: z.string().describe('Text with mentions, channels, emoji resolved.'),
  author: metadataShape.author,
  createdAt: metadataShape.createdAt,
  editedAt: metadataShape.editedAt,
  type: metadataShape.type,
  pinned: metadataShape.pinned,
  flags: metadataShape.flags,
  reference: referenceSchema,
  hasThread: metadataShape.hasThread,
  threadId: metadataShape.threadId,
  threadName: metadataShape.threadName,
  interaction: metadataShape.interaction,
  mentions: metadataShape.mentions,
  attachments: metadataShape.attachments,
  embeds: z.array(compactEmbedSchema),
  forwardedMessages: z.array(z.strictObject({
    content: nullableString,
    createdAt: nullableIsoTimestamp,
    attachments: z.number(),
    embeds: z.number(),
  })).describe('Compact summaries of forwarded messages; container content may be empty.'),
  reactions: metadataShape.reactions,
  stickers: metadataShape.stickers,
  poll: z.strictObject({
    question: nullableString,
    answers: z.array(nullableString),
    expiresAt: nullableIsoTimestamp,
  }).nullable(),
  components: componentsSchema,
});

export const fullMessageSchema = z.strictObject({
  ...identityShape,
  content: z.string().describe('Raw Discord text.'),
  cleanContent: z.string().describe('Text with mentions, channels, emoji resolved.'),
  author: metadataShape.author,
  createdAt: metadataShape.createdAt,
  editedAt: metadataShape.editedAt,
  type: metadataShape.type,
  pinned: metadataShape.pinned,
  flags: metadataShape.flags,
  reference: referenceSchema,
  hasThread: metadataShape.hasThread,
  threadId: metadataShape.threadId,
  threadName: metadataShape.threadName,
  interaction: metadataShape.interaction,
  mentions: metadataShape.mentions,
  attachments: metadataShape.attachments,
  embeds: z.array(z.strictObject({
    type: nullableString,
    title: nullableString,
    description: nullableString,
    author: z.strictObject({ name: z.string(), url: nullableString }).nullable(),
    fields: z.array(z.strictObject({ name: z.string(), value: z.string(), inline: z.boolean() })),
    footer: z.strictObject({ text: z.string() }).nullable(),
    image: nullableString,
    thumbnail: nullableString,
    url: nullableString,
  })),
  forwardedMessages: z.array(z.strictObject({
    type: enumName,
    content: z.string(),
    createdAt: nullableIsoTimestamp,
    attachments: z.array(z.strictObject({
      id: z.string(),
      name: z.string(),
      contentType: nullableString,
      url: z.string(),
    })),
    embeds: z.array(compactEmbedSchema),
    stickers: z.array(z.strictObject({ id: z.string(), name: z.string() })),
  })).describe('Full forwarded-message snapshots; container content may be empty.'),
  reactions: metadataShape.reactions,
  stickers: metadataShape.stickers,
  poll: z.strictObject({
    question: nullableString,
    answers: z.array(z.strictObject({
      text: nullableString,
      emoji: nullableString,
      voteCount: z.number().nullable(),
    })),
    expiresAt: nullableIsoTimestamp,
    resultsFinalized: z.boolean(),
  }).nullable(),
  components: componentsSchema,
});

export const searchHitSchema = z.strictObject({
  id: z.string(),
  guildId: z.string(),
  channelId: z.string(),
  url: z.string(),
  content: z.string().describe('Raw Discord text.'),
  author: z.strictObject({
    id: nullableString,
    username: nullableString,
    globalName: nullableString,
    bot: z.boolean(),
    webhookId: nullableString,
  }),
  createdAt: isoTimestamp,
  editedAt: nullableIsoTimestamp,
  type: z.string(),
  pinned: z.boolean(),
  attachments: z.array(z.strictObject({
    id: z.string(),
    name: z.string(),
    contentType: nullableString,
    size: z.number().nullable(),
    url: z.string().describe('Signed URL; expires after about 24 hours.'),
  })),
  embedCount: z.number(),
});

export type MessageCommon = z.output<typeof messageCommonSchema>;
export type CompactMessage = z.output<typeof compactMessageSchema>;
export type FullMessage = z.output<typeof fullMessageSchema>;
