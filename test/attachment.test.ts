import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Attachment, Client, Message } from 'discord.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { findAttachment, registerGetAttachment } from '../src/mcp/tools/get-attachment/index.js';
import { MAX_BYTES } from '../src/mcp/tools/get-attachment/schema.js';
import type { ToolDeps } from '../src/mcp/server.js';
import { perms, READ_HISTORY, VIEW } from './helpers.js';

// Гейт доступа к каналу — на уровне fetchMessage (messages.test.ts); здесь только поиск вложения.

const att = (id: string) => ({ id, name: `${id}.png`, url: `https://cdn/${id}` }) as unknown as Attachment;

function fakeMessage(topLevel: Attachment[], snapshots: Attachment[][] = []): Message<true> {
  return {
    attachments: new Map(topLevel.map((a) => [a.id, a])),
    messageSnapshots: new Map(
      snapshots.map((atts, i) => [`s${i}`, { attachments: new Map(atts.map((a) => [a.id, a])) }]),
    ),
  } as unknown as Message<true>;
}

describe('findAttachment — верхний уровень + форварды', () => {
  it('верхнеуровневое вложение находится', () => {
    assert.equal(findAttachment(fakeMessage([att('a1')]), 'a1')?.id, 'a1');
  });

  it('вложение из forwardedMessages[].attachments находится', () => {
    assert.equal(findAttachment(fakeMessage([], [[att('f1')]]), 'f1')?.id, 'f1');
  });

  it('форвард с несколькими вложениями → отдаётся точный по id', () => {
    const msg = fakeMessage([], [[att('f1'), att('f2')], [att('f3')]]);
    assert.equal(findAttachment(msg, 'f2')?.id, 'f2');
    assert.equal(findAttachment(msg, 'f3')?.id, 'f3');
  });

  it('неизвестный attachmentId → undefined (даёт not found)', () => {
    assert.equal(findAttachment(fakeMessage([att('a1')], [[att('f1')]]), 'nope'), undefined);
  });
});

describe('get_attachment inline limit', () => {
  it('не инлайнит ответ CDN, фактический размер которого превышает MAX_BYTES', async () => {
    const attachment = {
      id: 'a1',
      name: 'image.png',
      url: 'https://cdn.test/image.png',
      contentType: 'image/png',
      size: 1024,
    } as Attachment;
    const message = {
      inGuild: () => true,
      attachments: new Map([[attachment.id, attachment]]),
      messageSnapshots: new Map(),
    } as unknown as Message<true>;
    const channel = {
      id: 'c1',
      isTextBased: () => true,
      isDMBased: () => false,
      permissionsFor: () => perms(VIEW, READ_HISTORY),
      guild: { members: { fetch: async () => ({ id: 'u1' }) } },
      messages: { fetch: async () => message },
    };
    const discord = {
      channels: {
        cache: new Map([['c1', channel]]),
        fetch: async () => channel,
      },
    } as unknown as Client;

    let handler: ((args: Record<string, string>, extra: unknown) => Promise<CallToolResult>) | undefined;
    const server = {
      registerTool: (_name: string, _definition: unknown, callback: typeof handler) => {
        handler = callback;
      },
    } as unknown as McpServer;
    registerGetAttachment(server, { discord } as ToolDeps);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(MAX_BYTES + 1),
    }) as Response;
    try {
      assert.ok(handler);
      const result = await handler(
        { channelId: 'c1', messageId: 'm1', attachmentId: 'a1' },
        { authInfo: { extra: { discordUserId: 'u1' } } },
      );
      assert.deepEqual(result.content, []);
      assert.deepEqual(result.structuredContent?.attachment, {
        id: 'a1',
        name: 'image.png',
        contentType: 'image/png',
        size: 1024,
        delivery: 'metadata',
        note: `actual download too large to inline (> ${MAX_BYTES} bytes)`,
        url: 'https://cdn.test/image.png',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
