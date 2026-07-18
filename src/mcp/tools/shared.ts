import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  type Embed,
  type Message,
  MessageFlags,
  MessageReferenceType,
  MessageType,
  SnowflakeUtil,
  StickerFormatType,
} from 'discord.js';
import { MessageAccessError } from '../../discord/messages.js';
import type { CompactMessage, FullMessage, MessageCommon } from '../entities/message.js';

// before/after/around у get_messages и min_id/max_id у search принимаем в двух формах:
// ISO 8601-время ЛИБО сырой snowflake message id. Discord ждёт snowflake — ISO минтим по timestamp.
export function toSnowflake(v?: string): string | undefined {
  if (v === undefined) return undefined;
  if (/^\d{17,20}$/.test(v)) return v; // уже готовый snowflake id
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`invalid before/after "${v}" (expected ISO 8601 or a message id)`);
  return SnowflakeUtil.generate({ timestamp: t }).toString();
}

function truncate(s: string | null, n: number): string | null {
  if (s == null) return null;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Поля, одинаковые для компактного (get_messages) и полного (get_message) вида. Имена упомянутых
// каналов и тред отдаём как есть: Discord показывает их всем зрителям сообщения (msg.thread бывает
// только у публичного треда, видимого любому, кто видит канал; доступ проверяется лишь при переходе).
function base(msg: Message<true>): MessageCommon {
  const channels = [...msg.mentions.channels.values()].map((c) => ({
    id: c.id,
    name: 'name' in c ? c.name : null,
  }));
  const threadName = msg.thread?.name ?? null;
  return {
    id: msg.id,
    guildId: msg.guildId,
    channelId: msg.channelId,
    url: msg.url,
    author: {
      id: msg.author.id,
      username: msg.author.username, // @handle
      globalName: msg.author.globalName ?? null, // основное имя аккаунта
      nickname: msg.member?.nickname ?? null, // ник на этом сервере
      displayName: msg.member?.displayName ?? msg.author.displayName, // что видно в UI
      bot: msg.author.bot,
      webhookId: msg.webhookId ?? null,
    },
    createdAt: new Date(msg.createdTimestamp).toISOString(),
    editedAt: msg.editedTimestamp ? new Date(msg.editedTimestamp).toISOString() : null,
    type: MessageType[msg.type] ?? msg.type,
    pinned: msg.pinned,
    flags: {
      isVoiceMessage: msg.flags.has(MessageFlags.IsVoiceMessage),
    },
    hasThread: msg.hasThread,
    threadId: msg.thread?.id ?? null,
    threadName,
    interaction: msg.interaction
      ? {
          commandName: msg.interaction.commandName, // slash-команда, породившая сообщение
          user: { id: msg.interaction.user.id, username: msg.interaction.user.username },
        }
      : null,
    attachments: [...msg.attachments.values()].map((a) => ({
      id: a.id,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
      width: a.width,
      height: a.height,
      duration: a.duration, // секунды; голосовое сообщение, если не null
      description: a.description ?? null,
      spoiler: a.spoiler,
      url: a.url, // подписанный CDN-URL, истекает ~24ч — фетчить сразу
    })),
    reactions: [...msg.reactions.cache.values()].map((r) => ({
      emoji: r.emoji.name,
      emojiId: r.emoji.id,
      imageUrl: r.emoji.id ? r.emoji.imageURL() : null, // только кастом-эмодзи
      count: r.count,
    })),
    stickers: [...msg.stickers.values()].map((s) => ({
      id: s.id,
      name: s.name,
      format: StickerFormatType[s.format] ?? s.format,
      url: s.url,
    })),
    mentions: {
      everyone: msg.mentions.everyone,
      users: [...msg.mentions.users.values()].map((u) => ({
        id: u.id,
        username: u.username,
        globalName: u.globalName ?? null,
      })),
      roles: [...msg.mentions.roles.values()].map((r) => ({ id: r.id, name: r.name })),
      channels,
    },
  };
}

function embedCompact(e: Embed): CompactMessage['embeds'][number] {
  return {
    type: e.data.type ?? null,
    title: e.title ?? null,
    description: truncate(e.description, 200),
    fields: e.fields.length,
    url: e.url ?? null,
  };
}

function embedFull(e: Embed): FullMessage['embeds'][number] {
  return {
    type: e.data.type ?? null,
    title: e.title ?? null,
    description: e.description ?? null,
    author: e.author ? { name: e.author.name, url: e.author.url ?? null } : null,
    fields: e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })),
    footer: e.footer ? { text: e.footer.text } : null,
    image: e.image?.url ?? null,
    thumbnail: e.thumbnail?.url ?? null,
    url: e.url ?? null,
  };
}

function reference(msg: Message<true>): CompactMessage['reference'] {
  if (!msg.reference?.messageId) return null;
  return {
    messageId: msg.reference.messageId,
    channelId: msg.reference.channelId, // может быть другой канал — цепочка ходит между каналами
    guildId: msg.reference.guildId ?? null,
    type: MessageReferenceType[msg.reference.type] ?? msg.reference.type, // Default=reply, Forward=форвард
  };
}

// Подписи кнопок/плейсхолдеры селектов — рекурсивно из raw API-дерева компонентов.
function componentLabels(msg: Message<true>): string[] {
  const labels: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (typeof n.label === 'string') labels.push(n.label);
    if (typeof n.placeholder === 'string') labels.push(n.placeholder);
    if (Array.isArray(n.components)) for (const child of n.components) walk(child);
  };
  for (const c of msg.components) walk(c.toJSON());
  return labels;
}

// Сводка компонентов (кнопки/селекты): счётчик + читаемые подписи/плейсхолдеры. Сырое дерево
// компонентов — UI-плумбинг, агенту не нужно; одинаково для compact и full.
function componentsSummary(msg: Message<true>): CompactMessage['components'] {
  return msg.components.length
    ? { count: msg.components.length, labels: componentLabels(msg) }
    : null;
}

function pollSummary(msg: Message<true>): CompactMessage['poll'] {
  const p = msg.poll;
  if (!p) return null;
  return {
    question: p.question.text,
    answers: [...p.answers.values()].map((a) => ('text' in a ? a.text : null)),
    expiresAt: p.expiresTimestamp ? new Date(p.expiresTimestamp).toISOString() : null,
  };
}

function pollFull(msg: Message<true>): FullMessage['poll'] {
  const p = msg.poll;
  if (!p) return null;
  return {
    question: p.question.text,
    answers: [...p.answers.values()].map((a) => ({
      text: 'text' in a ? a.text : null,
      emoji: a.emoji?.name ?? null,
      voteCount: 'voteCount' in a ? a.voteCount : null,
    })),
    expiresAt: p.expiresTimestamp ? new Date(p.expiresTimestamp).toISOString() : null,
    resultsFinalized: p.resultsFinalized,
  };
}

// Пересланные (forward) сообщения: реальное содержимое — в snapshot, у самого msg content пуст.
function forwardsSummary(msg: Message<true>): CompactMessage['forwardedMessages'] {
  return [...msg.messageSnapshots.values()].map((s) => ({
    content: truncate(s.content ?? null, 200),
    attachments: s.attachments.size,
    embeds: s.embeds.length,
    createdAt: s.createdTimestamp ? new Date(s.createdTimestamp).toISOString() : null,
  }));
}

function forwardsFull(msg: Message<true>): FullMessage['forwardedMessages'] {
  return [...msg.messageSnapshots.values()].map((s) => ({
    type: MessageType[s.type] ?? s.type,
    content: s.content,
    createdAt: s.createdTimestamp ? new Date(s.createdTimestamp).toISOString() : null,
    attachments: [...s.attachments.values()].map((a) => ({
      id: a.id,
      name: a.name,
      contentType: a.contentType,
      url: a.url,
    })),
    embeds: s.embeds.map(embedCompact),
    stickers: [...s.stickers.values()].map((st) => ({ id: st.id, name: st.name })),
  }));
}

// Список компактных карточек (get_messages/get_pinned): только guild-сообщения.
export function formatCompactList(messages: Iterable<Message>): CompactMessage[] {
  return [...messages].filter((m): m is Message<true> => m.inGuild()).map(formatMessageCompact);
}

// get_messages — список истории: эмбеды/пересланное/опрос сводкой (иначе payload раздувается),
// reply — только ids (без доп-запроса за процитированным).
export function formatMessageCompact(msg: Message<true>): CompactMessage {
  return {
    ...base(msg),
    cleanContent: msg.cleanContent,
    embeds: msg.embeds.map(embedCompact),
    reference: reference(msg),
    poll: pollSummary(msg),
    components: componentsSummary(msg),
    forwardedMessages: forwardsSummary(msg),
  };
}

// Достаёт процитированное с той же проверкой прав, что и на прямое чтение. Нет доступа → null.
export type ReferenceResolver = (channelId: string, messageId: string) => Promise<Message<true> | null>;

// get_message — одно сообщение целиком: эмбеды с полями, опрос с голосами, raw-компоненты,
// содержимое форвардов, и превью процитированного.
export async function formatMessageFull(
  msg: Message<true>,
  resolveReference: ReferenceResolver,
): Promise<FullMessage> {
  let ref = reference(msg);
  // Процитированное резолвим через resolveReference — reply может ссылаться на другой канал.
  const refChannelId = msg.reference?.channelId;
  const refMessageId = msg.reference?.messageId;
  if (ref && refChannelId && refMessageId) {
    const target = await resolveReference(refChannelId, refMessageId);
    if (target) {
      ref = {
        ...ref,
        author: target.member?.displayName ?? target.author.displayName,
        content: truncate(target.content, 300),
      };
    }
  }
  return {
    ...base(msg),
    content: msg.content,
    cleanContent: msg.cleanContent,
    embeds: msg.embeds.map(embedFull),
    reference: ref,
    poll: pollFull(msg),
    components: componentsSummary(msg),
    forwardedMessages: forwardsFull(msg),
  };
}

export function structuredResult<S extends z.ZodType>(
  schema: S,
  data: NoInfer<z.output<S>>,
): CallToolResult {
  return { content: [], structuredContent: schema.parse(data) as Record<string, unknown> };
}

export function textResult<S extends z.ZodType>(
  text: string,
  schema: S,
  data: NoInfer<z.output<S>>,
): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: schema.parse(data) as Record<string, unknown>,
  };
}

export function imageResult<S extends z.ZodType>(
  dataBase64: string,
  mimeType: string,
  schema: S,
  data: NoInfer<z.output<S>>,
): CallToolResult {
  return {
    content: [{ type: 'image', data: dataBase64, mimeType }],
    structuredContent: schema.parse(data) as Record<string, unknown>,
  };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// Ошибку чтения сообщения → errorResult: гейт (MessageAccessError) несёт готовый текст,
// сбой Discord-фетча — под общий fallback.
export function fetchErrorResult(e: unknown, fallback: string): CallToolResult {
  if (e instanceof MessageAccessError) return errorResult(e.message);
  return errorResult(`${fallback}: ${(e as Error).message}`);
}
