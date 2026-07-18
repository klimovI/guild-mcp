import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { fetchPinned } from '../../../discord/messages.js';
import type { ToolDeps } from '../../server.js';
import { fetchErrorResult, formatCompactList, structuredResult } from '../shared.js';
import { definition, outputSchema } from './schema.js';

// get_pinned — закреплённые сообщения канала (прослойка к GET /channels/{id}/pins).
// Тот же гейтинг по видимости канала, что и у get_messages.
export function registerGetPinned(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_pinned',
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      let pinned;
      try {
        pinned = await fetchPinned(deps.discord, caller.userId, args.channelId);
      } catch (e) {
        return fetchErrorResult(e, 'Failed to fetch pinned messages');
      }
      return structuredResult(outputSchema, { messages: formatCompactList(pinned) });
    },
  );
}
