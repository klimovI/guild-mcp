import type { AnyThreadChannel } from 'discord.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { canUserView, canUserViewChannel } from '../../../discord/permissions.js';
import type { ThreadOutput } from '../../entities/channel.js';
import type { ToolDeps } from '../../server.js';
import { errorResult, structuredResult } from '../shared.js';
import { DEFAULT_LIMIT, definition, outputSchema } from './schema.js';

function threadMeta(t: AnyThreadChannel): ThreadOutput {
  return {
    id: t.id,
    parentId: t.parentId, // канал, из которого ответвился тред
    name: t.name,
    ownerId: t.ownerId,
    createdAt: t.createdTimestamp ? new Date(t.createdTimestamp).toISOString() : null,
    archived: t.archived,
    // archivedAt — курсор пагинации архивных: передай самый старый из выдачи как before.
    // Только для реально архивных (у активных Discord тоже держит archiveTimestamp — не путаем).
    archivedAt: t.archived && t.archiveTimestamp ? new Date(t.archiveTimestamp).toISOString() : null,
    locked: t.locked,
    autoArchiveDuration: t.autoArchiveDuration,
    messageCount: t.messageCount,
    memberCount: t.memberCount,
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
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      const limit = args.limit ?? DEFAULT_LIMIT;
      if (args.before !== undefined && args.channelId === undefined) {
        return errorResult('before requires channelId.');
      }
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
      return structuredResult(outputSchema, { threads: visible.map(threadMeta), hasMore });
    },
  );
}
