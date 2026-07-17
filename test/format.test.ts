import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message } from 'discord.js';
import { fetchMessage } from '../src/discord/messages.js';
import { formatMessageCompact, formatMessageFull } from '../src/mcp/tools/shared.js';
import { fakeChannel, fakeClient, perms, VIEW } from './helpers.js';

// Покрывает security-критичный гейтинг в shared.ts: имена/содержимое каналов, недоступных
// вызвавшему (mentions/thread/reply-preview), НЕ должны протечь. gate управляем из теста.

type MsgOpts = {
  cleanContent?: string;
  mentionChannels?: { id: string; name: string }[];
  thread?: { id: string; name: string } | null;
  reference?: { messageId: string; channelId: string; guildId?: string; type: number } | null;
};

function fakeMessage(opts: MsgOpts = {}): Message<true> {
  const { cleanContent = '', mentionChannels = [], thread = null, reference = null } = opts;
  return {
    id: 'm1',
    channelId: 'c1',
    guildId: 'g1',
    url: 'https://discord.com/channels/g1/c1/m1',
    inGuild: () => true,
    author: { id: 'u1', username: 'user', globalName: null, displayName: 'User', bot: false },
    member: { nickname: null, displayName: 'User' },
    webhookId: null,
    content: cleanContent,
    cleanContent,
    createdTimestamp: 1_700_000_000_000,
    editedTimestamp: null,
    type: 0,
    pinned: false,
    flags: { has: () => false },
    hasThread: thread !== null,
    thread,
    interaction: null,
    attachments: new Map(),
    reactions: { cache: new Map() },
    stickers: new Map(),
    mentions: {
      everyone: false,
      users: new Map(),
      roles: new Map(),
      channels: new Map(mentionChannels.map((c) => [c.id, c])),
    },
    embeds: [],
    components: [],
    poll: null,
    messageSnapshots: new Map(),
    reference,
  } as unknown as Message<true>;
}

const ALLOW = async () => true;
const DENY = async () => false;

describe('formatMessageCompact — гейтинг упоминаний каналов', () => {
  const msg = () => fakeMessage({ cleanContent: 'see #secret now', mentionChannels: [{ id: 'c9', name: 'secret' }] });

  it('канал недоступен вызвавшему → имя скрыто (null), id остаётся, #name→<#id> в cleanContent', async () => {
    const out = (await formatMessageCompact(msg(), DENY)) as { mentions: { channels: { id: string; name: string | null }[] }; cleanContent: string };
    assert.equal(out.mentions.channels[0].id, 'c9');
    assert.equal(out.mentions.channels[0].name, null);
    assert.equal(out.cleanContent, 'see <#c9> now');
  });

  it('канал доступен → имя и cleanContent как есть', async () => {
    const out = (await formatMessageCompact(msg(), ALLOW)) as { mentions: { channels: { name: string | null }[] }; cleanContent: string };
    assert.equal(out.mentions.channels[0].name, 'secret');
    assert.equal(out.cleanContent, 'see #secret now');
  });
});

describe('formatMessageCompact — гейтинг имени треда', () => {
  const msg = () => fakeMessage({ thread: { id: 't1', name: 'private-thread' } });

  it('тред недоступен → threadName null, но threadId остаётся', async () => {
    const out = (await formatMessageCompact(msg(), DENY)) as { threadName: string | null; threadId: string | null };
    assert.equal(out.threadName, null);
    assert.equal(out.threadId, 't1');
  });

  it('тред доступен → threadName виден', async () => {
    const out = (await formatMessageCompact(msg(), ALLOW)) as { threadName: string | null };
    assert.equal(out.threadName, 'private-thread');
  });
});

describe('formatMessageFull — гейтинг превью процитированного (reply)', () => {
  const target = {
    member: { displayName: 'Ann' },
    author: { displayName: 'ann' },
    content: 'quoted text',
  } as unknown as Message<true>;
  const msg = () => fakeMessage({ reference: { messageId: 'm2', channelId: 'cX', guildId: 'g1', type: 0 } });

  const RESOLVE_TARGET = async () => target;
  const NO_ACCESS = async () => null;

  it('resolver вернул null (нет доступа к target) → только ids, без author/content', async () => {
    const out = (await formatMessageFull(msg(), ALLOW, NO_ACCESS)) as { reference: Record<string, unknown> };
    assert.equal(out.reference.messageId, 'm2');
    assert.equal(out.reference.channelId, 'cX');
    assert.equal(out.reference.author, undefined);
    assert.equal(out.reference.content, undefined);
  });

  it('resolver вернул target → добавляется превью (author + content)', async () => {
    const out = (await formatMessageFull(msg(), ALLOW, RESOLVE_TARGET)) as { reference: Record<string, unknown> };
    assert.equal(out.reference.author, 'Ann');
    assert.equal(out.reference.content, 'quoted text');
  });
});

describe('formatMessageFull — reply-превью не обходит ReadMessageHistory', () => {
  // target-канал даёт ViewChannel, но НЕ ReadMessageHistory. resolver поверх реального fetchMessage
  // (тот же гейт, что и на прямое чтение) → доступ закрыт, превью не течёт.
  it('ViewChannel=true, ReadMessageHistory=false → reference только ids, без author/content', async () => {
    const refChannel = fakeChannel({ id: 'cX', channelPerms: perms(VIEW) });
    const client = fakeClient({ cache: { cX: refChannel } });
    const resolveReference = async (channelId: string, messageId: string) => {
      try {
        return await fetchMessage(client, 'u1', channelId, messageId);
      } catch {
        return null;
      }
    };
    const msg = fakeMessage({ reference: { messageId: 'm2', channelId: 'cX', guildId: 'g1', type: 0 } });
    const out = (await formatMessageFull(msg, ALLOW, resolveReference)) as { reference: Record<string, unknown> };
    assert.equal(out.reference.messageId, 'm2');
    assert.equal(out.reference.author, undefined);
    assert.equal(out.reference.content, undefined);
  });
});
