import type { Attachment, Message } from 'discord.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callerFromAuth } from '../../../auth/session.js';
import { fetchMessage } from '../../../discord/messages.js';
import type { AttachmentOutput } from '../../entities/attachment.js';
import type { ToolDeps } from '../../server.js';
import { errorResult, fetchErrorResult, imageResult, structuredResult, textResult } from '../shared.js';
import { definition, MAX_BYTES, outputSchema } from './schema.js';

const FETCH_TIMEOUT_MS = 10_000; // внешний CDN-фетч не должен подвешивать запрос бесконечно

function isTextType(mime: string | null): boolean {
  if (!mime) return false;
  return (
    mime.startsWith('text/') ||
    /^application\/(json|xml|x-yaml|yaml|javascript|csv|x-sh)(;|$)/.test(mime)
  );
}

// Форвард (messageSnapshots) уже легально виден вызвавшему — он видит сообщение-контейнер; по
// reference к оригиналу не идём: исходный канал может быть ему недоступен.
export function findAttachment(msg: Message<true>, attachmentId: string): Attachment | undefined {
  return (
    msg.attachments.get(attachmentId) ??
    [...msg.messageSnapshots.values()]
      .map((s) => s.attachments.get(attachmentId))
      .find((a) => a !== undefined)
  );
}

// get_attachment — отдать САМО вложение, а не только ссылку: картинку как image-контент (Claude
// её видит), текстовый файл как текст. Гейтинг через сообщение (channelId+messageId), НЕ через
// голый URL — иначе подписанный CDN-URL обходил бы проверку доступа.
export function registerGetAttachment(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_attachment',
    definition,
    async (args, extra) => {
      const caller = callerFromAuth(extra.authInfo);
      let attachment;
      try {
        const msg = await fetchMessage(deps.discord, caller.userId, args.channelId, args.messageId);
        attachment = findAttachment(msg, args.attachmentId);
      } catch (e) {
        return fetchErrorResult(e, `Failed to fetch message ${args.messageId} in channel ${args.channelId}`);
      }
      if (!attachment) {
        return errorResult(
          `Attachment ${args.attachmentId} not found in message ${args.messageId}. ` +
            'Re-fetch get_message and use an attachmentId from its attachments[] or ' +
            "forwardedMessages[].attachments[] — a forward has its own attachment ids, not the original message's.",
        );
      }

      const meta = {
        id: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        url: attachment.url,
      } satisfies Omit<AttachmentOutput, 'delivery' | 'note'>;
      if (attachment.size > MAX_BYTES) {
        return structuredResult(outputSchema, {
          attachment: { ...meta, delivery: 'metadata', note: `too large to inline (> ${MAX_BYTES} bytes)` },
        });
      }

      const isImage = attachment.contentType?.startsWith('image/') ?? false;
      const isText = isTextType(attachment.contentType);
      if (!isImage && !isText) {
        return structuredResult(outputSchema, {
          attachment: { ...meta, delivery: 'metadata', note: 'binary attachment; download from url' },
        });
      }

      let buf: Buffer;
      try {
        const res = await fetch(attachment.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) {
          return structuredResult(outputSchema, {
            attachment: { ...meta, delivery: 'metadata', note: `fetch failed: HTTP ${res.status}` },
          });
        }
        buf = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        return structuredResult(outputSchema, {
          attachment: { ...meta, delivery: 'metadata', note: `fetch failed: ${(e as Error).message}` },
        });
      }

      if (isImage) {
        return imageResult(
          buf.toString('base64'),
          attachment.contentType ?? 'application/octet-stream',
          outputSchema,
          { attachment: { ...meta, delivery: 'image' } },
        );
      }
      return textResult(
        buf.toString('utf8'),
        outputSchema,
        { attachment: { ...meta, delivery: 'text' } },
      );
    },
  );
}
