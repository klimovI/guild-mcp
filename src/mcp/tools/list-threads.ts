import type { AnyThreadChannel } from 'discord.js';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../auth/session.js';
import { canUserView, canUserViewChannel } from '../../discord/permissions.js';
import type { ToolDeps } from '../server.js';
import { errorResult, jsonResult } from './shared.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function threadMeta(t: AnyThreadChannel): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    parentId: t.parentId, // канал, из которого ответвился тред
    ownerId: t.ownerId,
    archived: t.archived,
    // archivedAt — курсор пагинации архивных: передай самый старый из выдачи как before.
    // Только для реально архивных (у активных Discord тоже держит archiveTimestamp — не путаем).
    archivedAt: t.archived && t.archiveTimestamp ? new Date(t.archiveTimestamp).toISOString() : null,
    locked: t.locked,
    messageCount: t.messageCount,
    memberCount: t.memberCount,
    createdAt: t.createdTimestamp ? new Date(t.createdTimestamp).toISOString() : null,
    autoArchiveDuration: t.autoArchiveDuration,
  };
}

// list_threads — треды (прослойка к thread-эндпоинтам Discord). Пагинация повторяет нативную
// модель архивных тредов: before (archive timestamp) + limit → { threads, hasMore }.
// С channelId: первая страница (before пуст) = активные + первая страница public-archived;
// далее (before задан) — только следующая страница public-archived.
// Без channelId: активные треды по обслуживаемым гильдиям. Только видимые вызвавшему.
export function registerListThreads(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_threads',
    {
      description:
        'Threads you may see. With channelId: that channel/forum\'s active + public archived ' +
        'threads; page older archived by passing the oldest returned archivedAt as before ' +
        '(hasMore = more remain; limit ≤100, default 50). Without channelId: active threads across ' +
        'your servers. Returns { threads, hasMore }; read one with get_messages(channelId=thread id).',
      inputSchema: {
        channelId: z
          .string()
          .optional()
          .describe('Parent channel/forum id. Omit for active threads across all servers.'),
        before: z
          .string()
          .optional()
          .describe('Page archived threads older than this archive timestamp (ISO 8601). Use with channelId.'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Max archived per page (default 50).'),
      },
    },
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      const limit = args.limit ?? DEFAULT_LIMIT;
      if (args.before !== undefined && Number.isNaN(Date.parse(args.before))) {
        return errorResult(`Invalid before "${args.before}" (expected ISO 8601 timestamp).`);
      }

      const collected: AnyThreadChannel[] = [];
      let hasMore = false;

      if (args.channelId) {
        const allowed = await canUserViewChannel(deps.discord, caller.userId, args.channelId);
        if (!allowed) return errorResult(`Access denied: you cannot view channel ${args.channelId}.`);
        const channel = await deps.discord.channels.fetch(args.channelId);
        if (!channel || !('threads' in channel)) {
          return errorResult(`Channel ${args.channelId} does not have threads.`);
        }

        if (args.before === undefined) {
          const active = await channel.threads.fetchActive();
          collected.push(...active.threads.values());
        }

        const pub = await channel.threads.fetchArchived({ type: 'public', before: args.before, limit });
        collected.push(...pub.threads.values());
        hasMore = pub.hasMore;
      } else {
        for (const guild of deps.discord.guilds.cache.values()) {
          const active = await guild.channels.fetchActiveThreads();
          collected.push(...active.threads.values());
        }
      }

      const visible: AnyThreadChannel[] = [];
      for (const t of collected) {
        if (await canUserView(deps.discord, caller.userId, t.id)) visible.push(t);
      }
      return jsonResult({ threads: visible.map(threadMeta), hasMore });
    },
  );
}
