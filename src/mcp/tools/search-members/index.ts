import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { callerGuilds } from '../../../discord/permissions.js';
import type { MemberListItem } from '../../entities/member.js';
import type { ToolDeps } from '../../server.js';
import { structuredResult } from '../shared.js';
import { DEFAULT_LIMIT, definition, outputSchema } from './schema.js';

// search_members — поиск участников по имени/нику (префикс) через GET /guilds/{id}/members/search,
// по гильдиям, которые вызвавший делит с ботом. Даёт id для search_messages(authorId)/get_member.
export function registerSearchMembers(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'search_members',
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      const guilds = await callerGuilds(deps.discord, caller.userId, args.guildId);

      const results: MemberListItem[] = [];
      for (const guild of guilds) {
        let found;
        try {
          found = await guild.members.search({ query: args.query, limit: args.limit ?? DEFAULT_LIMIT });
        } catch {
          continue; // гильдия недоступна для поиска — пропускаем, не роняем весь обход
        }
        for (const m of found.values()) {
          results.push({
            id: m.user.id,
            username: m.user.username,
            globalName: m.user.globalName ?? null,
            nickname: m.nickname ?? null,
            bot: m.user.bot,
            guildId: guild.id,
            guildName: guild.name,
          });
        }
      }
      return structuredResult(outputSchema, { members: results });
    },
  );
}
