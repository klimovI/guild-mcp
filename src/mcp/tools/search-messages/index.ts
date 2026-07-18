import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { search, SearchError } from '../../../discord/search.js';
import type { ToolDeps } from '../../server.js';
import { errorResult, structuredResult, toSnowflake } from '../shared.js';
import { DEFAULT_LIMIT, definition, outputSchema } from './schema.js';

// search_messages — прослойка к Discord Search API, ограниченная каналами, видимыми
// вызвавшему. Параметры повторяют нативный endpoint; ранжирование выполняет Discord.
export function registerSearchMessages(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'search_messages',
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      try {
        const result = await search(deps.discord, caller.userId, {
          content: args.content,
          channelId: args.channelId,
          authorId: args.authorId,
          mentions: args.mentions,
          has: args.has,
          pinned: args.pinned,
          minId: toSnowflake(args.minId),
          maxId: toSnowflake(args.maxId),
          sortBy: args.sortBy,
          sortOrder: args.sortOrder,
          limit: args.limit ?? DEFAULT_LIMIT,
          offset: args.offset,
        });
        return structuredResult(outputSchema, result);
      } catch (e) {
        if (e instanceof SearchError) return errorResult(e.message);
        throw e;
      }
    },
  );
}
