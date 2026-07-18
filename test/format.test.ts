import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message } from 'discord.js';
import { fetchMessage } from '../src/discord/messages.js';
import { formatMessageCompact, formatMessageFull } from '../src/mcp/tools/shared.js';
import { fakeChannel, fakeClient, perms, VIEW } from './helpers.js';

// Покрывает security-критичный гейтинг в shared.ts: содержимое процитированного (reply-preview)
// НЕ должно протечь, если вызвавший не может прочитать то сообщение. Имена упомянутых каналов и
// тред НЕ гейтим — Discord показывает их всем зрителям сообщения.

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

describe('formatMessageCompact — упоминания каналов и тред (как Discord: имя видно всем)', () => {
  it('имя канала и cleanContent отдаются как есть', () => {
    const msg = fakeMessage({ cleanContent: 'see #secret now', mentionChannels: [{ id: 'c9', name: 'secret' }] });
    const out = formatMessageCompact(msg) as { mentions: { channels: { id: string; name: string | null }[] }; cleanContent: string };
    assert.equal(out.mentions.channels[0].id, 'c9');
    assert.equal(out.mentions.channels[0].name, 'secret');
    assert.equal(out.cleanContent, 'see #secret now');
    assert.equal('content' in out, false);
  });

  it('имя треда (msg.thread — всегда публичный) отдаётся как есть', () => {
    const out = formatMessageCompact(fakeMessage({ thread: { id: 't1', name: 'my-thread' } })) as { threadName: string | null; threadId: string | null };
    assert.equal(out.threadName, 'my-thread');
    assert.equal(out.threadId, 't1');
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
    const out = (await formatMessageFull(msg(), NO_ACCESS)) as { reference: Record<string, unknown> };
    assert.equal(out.reference.messageId, 'm2');
    assert.equal(out.reference.channelId, 'cX');
    assert.equal(out.reference.author, undefined);
    assert.equal(out.reference.content, undefined);
  });

  it('resolver вернул target → добавляется превью (author + content)', async () => {
    const out = (await formatMessageFull(msg(), RESOLVE_TARGET)) as { reference: Record<string, unknown> };
    assert.equal(out.reference.author, 'Ann');
    assert.equal(out.reference.content, 'quoted text');
    assert.equal('content' in out, true);
    assert.equal('cleanContent' in out, true);
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
    const out = (await formatMessageFull(msg, resolveReference)) as { reference: Record<string, unknown> };
    assert.equal(out.reference.messageId, 'm2');
    assert.equal(out.reference.author, undefined);
    assert.equal(out.reference.content, undefined);
  });
});
