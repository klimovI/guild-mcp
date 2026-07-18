import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { fetchMessage } from '../../../discord/messages.js';
import type { ToolDeps } from '../../server.js';
import { fetchErrorResult, formatMessageFull, structuredResult } from '../shared.js';
import { definition, outputSchema } from './schema.js';

// get_message — одно сообщение по id, полная карточка из Discord API. Для «разверни хит search».
// Тот же гейтинг по каналу, что и у get_messages: отказ, если вызвавший канал не видит.
export function registerGetMessage(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_message',
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      let msg;
      try {
        msg = await fetchMessage(deps.discord, caller.userId, args.channelId, args.messageId);
      } catch (e) {
        return fetchErrorResult(e, `Failed to fetch message ${args.messageId} in channel ${args.channelId}`);
      }
      const resolveReference = async (channelId: string, messageId: string) => {
        try {
          return await fetchMessage(deps.discord, caller.userId, channelId, messageId);
        } catch {
          return null; // недоступно/удалено/нет прав на target — оставляем только ids
        }
      };
      return structuredResult(outputSchema, { message: await formatMessageFull(msg, resolveReference) });
    },
  );
}
