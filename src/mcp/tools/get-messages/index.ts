import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { fetchMessages } from '../../../discord/messages.js';
import type { ToolDeps } from '../../server.js';
import { errorResult, fetchErrorResult, formatCompactList, structuredResult, toSnowflake } from '../shared.js';
import { DEFAULT_LIMIT, definition, outputSchema } from './schema.js';

// get_messages — история канала (newest first), полное содержимое, живое чтение из Discord API.
// Отказ, если вызвавший канал не видит.
export function registerGetMessages(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_messages',
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      if (args.around !== undefined && (args.before !== undefined || args.after !== undefined)) {
        return errorResult('around is exclusive with before/after — pass only one.');
      }
      let messages;
      try {
        messages = await fetchMessages(deps.discord, caller.userId, args.channelId, {
          before: toSnowflake(args.before),
          after: toSnowflake(args.after),
          around: toSnowflake(args.around),
          limit: args.limit ?? DEFAULT_LIMIT,
        });
      } catch (e) {
        return fetchErrorResult(e, 'Failed to fetch messages');
      }
      return structuredResult(outputSchema, { messages: formatCompactList(messages) });
    },
  );
}
