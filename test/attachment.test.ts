import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Attachment, Message } from 'discord.js';
import { findAttachment, resolveAttachment } from '../src/mcp/tools/get-attachment.js';

// Гейт доступа к каналу — на уровне fetchMessage (messages.test.ts); здесь только поиск вложения.

const att = (id: string) => ({ id, name: `${id}.png`, url: `https://cdn/${id}` }) as unknown as Attachment;

function fakeMessage(topLevel: Attachment[], snapshots: Attachment[][] = []): Message<true> {
  return {
    attachments: new Map(topLevel.map((a) => [a.id, a])),
    messageSnapshots: new Map(
      snapshots.map((atts, i) => [`s${i}`, { attachments: new Map(atts.map((a) => [a.id, a])) }]),
    ),
  } as unknown as Message<true>;
}

describe('findAttachment — верхний уровень + форварды', () => {
  it('верхнеуровневое вложение находится', () => {
    assert.equal(findAttachment(fakeMessage([att('a1')]), 'a1')?.id, 'a1');
  });

  it('вложение из forwardedMessages[].attachments находится', () => {
    assert.equal(findAttachment(fakeMessage([], [[att('f1')]]), 'f1')?.id, 'f1');
  });

  it('форвард с несколькими вложениями → отдаётся точный по id', () => {
    const msg = fakeMessage([], [[att('f1'), att('f2')], [att('f3')]]);
    assert.equal(findAttachment(msg, 'f2')?.id, 'f2');
    assert.equal(findAttachment(msg, 'f3')?.id, 'f3');
  });

  it('неизвестный attachmentId → undefined (даёт not found)', () => {
    assert.equal(findAttachment(fakeMessage([att('a1')], [[att('f1')]]), 'nope'), undefined);
  });
});

describe('resolveAttachment — force-refetch при промахе', () => {
  it('кэш без snapshot → miss → force-fetch со snapshot → вложение найдено', async () => {
    const cached = fakeMessage([], []); // холодный кэш: форвард-снапшот не догружен
    const fresh = fakeMessage([], [[att('f1')]]); // REST отдаёт полный снапшот
    const forces: boolean[] = [];
    const res = await resolveAttachment(async (force) => {
      forces.push(force);
      return force ? fresh : cached;
    }, 'f1');
    assert.equal(res?.id, 'f1');
    assert.deepEqual(forces, [false, true]); // сперва кэш, потом форс
  });

  it('вложение уже в кэше → без force-fetch (лишнего REST нет)', async () => {
    const cached = fakeMessage([att('a1')]);
    const forces: boolean[] = [];
    const res = await resolveAttachment(async (force) => {
      forces.push(force);
      return cached;
    }, 'a1');
    assert.equal(res?.id, 'a1');
    assert.deepEqual(forces, [false]); // форс не понадобился
  });

  it('нет и после force-fetch → undefined', async () => {
    const res = await resolveAttachment(async () => fakeMessage([], []), 'nope');
    assert.equal(res, undefined);
  });
});
