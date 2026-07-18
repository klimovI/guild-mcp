import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { isoTimestamp } from '../src/mcp/entities/common.js';
import { createMcpServer, type ToolDeps } from '../src/mcp/server.js';
import { inputSchema as listThreadsInput } from '../src/mcp/tools/list-threads/schema.js';
import { structuredResult } from '../src/mcp/tools/shared.js';

describe('MCP contract', () => {
  it('publishes closed input and output schemas for every tool', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer({} as ToolDeps);
    const client = new Client({ name: 'schema-test', version: '1' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const tools = (await client.listTools()).tools;
      assert.equal(tools.length, 10);
      const byName = new Map(tools.map((tool) => [tool.name, tool]));
      for (const tool of tools) {
        assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} input is not closed`);
        assert.ok(tool.outputSchema, `${tool.name} has no output schema`);
        assert.equal(tool.outputSchema.additionalProperties, false, `${tool.name} output is not closed`);
      }

      const listChannels = tools.find((tool) => tool.name === 'list_channels');
      assert.deepEqual(listChannels?.inputSchema.properties, {});

      const inputOrder: Record<string, string[]> = {
        search_messages: ['content', 'channelId', 'authorId', 'mentions', 'has', 'pinned', 'minId', 'maxId', 'sortBy', 'sortOrder', 'limit', 'offset'],
        get_messages: ['channelId', 'before', 'after', 'around', 'limit'],
        get_message: ['channelId', 'messageId'],
        get_attachment: ['channelId', 'messageId', 'attachmentId'],
        get_channel: ['channelId'],
        list_threads: ['channelId', 'before', 'limit'],
        get_pinned: ['channelId'],
        list_channels: [],
        get_member: ['userId', 'guildId'],
        search_members: ['query', 'guildId', 'limit'],
      };
      for (const [name, fields] of Object.entries(inputOrder)) {
        assert.deepEqual(Object.keys(byName.get(name)?.inputSchema.properties ?? {}), fields, name);
      }

      type JsonSchema = { properties?: Record<string, JsonSchema>; items?: JsonSchema };
      const outputAt = (name: string, ...path: string[]): JsonSchema => {
        let schema = byName.get(name)?.outputSchema as unknown as JsonSchema;
        for (const part of path) {
          schema = part === 'items' ? schema.items! : schema.properties![part];
        }
        return schema;
      };
      const expectOrder = (name: string, path: string[], fields: string[]): void => {
        assert.deepEqual(Object.keys(outputAt(name, ...path).properties ?? {}), fields, name);
      };

      const compactFields = [
        'id', 'guildId', 'channelId', 'url', 'cleanContent', 'author', 'createdAt', 'editedAt',
        'type', 'pinned', 'flags', 'reference', 'hasThread', 'threadId', 'threadName', 'interaction',
        'mentions', 'attachments', 'embeds', 'forwardedMessages', 'reactions', 'stickers', 'poll', 'components',
      ];
      const fullFields = [
        'id', 'guildId', 'channelId', 'url', 'content', 'cleanContent', 'author', 'createdAt', 'editedAt',
        'type', 'pinned', 'flags', 'reference', 'hasThread', 'threadId', 'threadName', 'interaction',
        'mentions', 'attachments', 'embeds', 'forwardedMessages', 'reactions', 'stickers', 'poll', 'components',
      ];
      expectOrder('get_messages', ['messages', 'items'], compactFields);
      expectOrder('get_pinned', ['messages', 'items'], compactFields);
      expectOrder('get_message', ['message'], fullFields);
      expectOrder('search_messages', ['messages', 'items'], [
        'id', 'guildId', 'channelId', 'url', 'content', 'author', 'createdAt', 'editedAt',
        'type', 'pinned', 'attachments', 'embedCount',
      ]);
      expectOrder('get_attachment', ['attachment'], [
        'id', 'name', 'contentType', 'size', 'delivery', 'note', 'url',
      ]);
      expectOrder('get_channel', ['channel'], [
        'id', 'guildId', 'name', 'type', 'parentId', 'topic', 'ownerId', 'starterMessageId',
        'archived', 'locked', 'archiveTimestamp', 'autoArchiveDuration', 'messageCount', 'memberCount',
      ]);
      expectOrder('list_threads', ['threads', 'items'], [
        'id', 'parentId', 'name', 'ownerId', 'createdAt', 'archived', 'archivedAt', 'locked',
        'autoArchiveDuration', 'messageCount', 'memberCount',
      ]);
      expectOrder('list_channels', ['channels', 'items'], [
        'id', 'guildId', 'guildName', 'name', 'type', 'parentId', 'categoryName',
      ]);
      expectOrder('get_member', [], ['id', 'username', 'globalName', 'bot', 'memberships']);
      expectOrder('search_members', ['members', 'items'], [
        'id', 'username', 'globalName', 'nickname', 'bot', 'guildId', 'guildName',
      ]);

      const getMessage = tools.find((tool) => tool.name === 'get_message');
      const message = getMessage?.outputSchema?.properties?.message as {
        properties?: { content?: unknown; cleanContent?: { description?: string } };
      };
      assert.ok(message.properties?.content);
      assert.ok(message.properties?.cleanContent?.description);

      const getMessages = tools.find((tool) => tool.name === 'get_messages');
      const compactMessage = getMessages?.outputSchema?.properties?.messages as {
        items?: { properties?: { content?: unknown; cleanContent?: unknown } };
      };
      assert.equal(compactMessage.items?.properties?.content, undefined);
      assert.ok(compactMessage.items?.properties?.cleanContent);

      const searchMessages = tools.find((tool) => tool.name === 'search_messages');
      const searchHit = searchMessages?.outputSchema?.properties?.messages as {
        items?: {
          properties?: {
            content?: { description?: string };
            createdAt?: { format?: string };
            attachments?: { items?: { properties?: { url?: { description?: string } } } };
          };
        };
      };
      assert.ok(searchHit.items?.properties?.content?.description);
      assert.equal(searchHit.items?.properties?.createdAt?.format, 'date-time');
      assert.ok(searchHit.items?.properties?.attachments?.items?.properties?.url?.description);
    } finally {
      await client.close();
    }
  });

  it('returns structured data without text JSON and rejects extra fields', () => {
    const schema = z.strictObject({ first: z.string(), second: z.string() });
    const result = structuredResult(schema, { second: '2', first: '1' });
    assert.deepEqual(result.content, []);
    assert.deepEqual(Object.keys(result.structuredContent ?? {}), ['first', 'second']);
    assert.deepEqual(result.structuredContent, { first: '1', second: '2' });
    assert.throws(
      () => structuredResult(schema, { first: '1', second: '2', extra: true } as never),
      z.ZodError,
    );
  });

  it('requires channelId when list_threads uses before', () => {
    assert.equal(listThreadsInput.safeParse({ before: '2026-01-01T00:00:00Z' }).success, false);
    assert.equal(
      listThreadsInput.safeParse({ channelId: 'c1', before: '2026-01-01T00:00:00Z' }).success,
      true,
    );
  });

  it('accepts ISO timestamps with Z or an explicit offset', () => {
    assert.equal(isoTimestamp.safeParse('2026-01-01T00:00:00.000Z').success, true);
    assert.equal(isoTimestamp.safeParse('2026-01-01T08:00:00+08:00').success, true);
    assert.equal(isoTimestamp.safeParse('not-a-date').success, false);
  });
});
