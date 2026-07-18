import { ChannelType, type GuildBasedChannel } from 'discord.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { visibleChannelsForUser } from '../../../discord/permissions.js';
import type { ChannelListItem } from '../../entities/channel.js';
import type { ToolDeps } from '../../server.js';
import { structuredResult } from '../shared.js';
import { definition, outputSchema } from './schema.js';

// Имя объемлющей категории. Для обычного канала parent — сама категория; для треда parent —
// его текст-канал, а категория — на уровень выше. null, если канал вне категории.
function categoryNameOf(ch: GuildBasedChannel): string | null {
  const parent = ch.parentId ? ch.guild.channels.cache.get(ch.parentId) : null;
  if (!parent) return null;
  if (parent.type === ChannelType.GuildCategory) return parent.name;
  const grand = parent.parentId ? ch.guild.channels.cache.get(parent.parentId) : null;
  return grand?.type === ChannelType.GuildCategory ? grand.name : null;
}

// list_channels — только каналы, видимые вызвавшему (фильтр permissionsFor).
export function registerListChannels(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_channels',
    definition,
    async (_args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      const channels = await visibleChannelsForUser(deps.discord, caller.userId);
      const list: ChannelListItem[] = channels.map((c) => ({
        id: c.id,
        guildId: c.guildId,
        guildName: c.guild.name,
        name: c.name,
        type: ChannelType[c.type] ?? c.type,
        parentId: c.parentId ?? null,
        categoryName: categoryNameOf(c),
      }));
      return structuredResult(outputSchema, { channels: list });
    },
  );
}
