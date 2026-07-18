import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { isTrustedMcpOrigin, mcpGetNotAllowed } from '../src/http/server.js';

describe('MCP HTTP transport', () => {
  it('allows server clients without Origin and only the configured browser origin', () => {
    assert.equal(isTrustedMcpOrigin(undefined, 'https://example.test'), true);
    assert.equal(isTrustedMcpOrigin('https://example.test', 'https://example.test/base'), true);
    assert.equal(isTrustedMcpOrigin('https://evil.test', 'https://example.test'), false);
  });

  it('answers standalone GET with 405 and advertises POST', () => {
    let status: number | undefined;
    let allow: string | undefined;
    let body: string | undefined;
    const response = {
      set: (_name: string, value: string) => {
        allow = value;
        return response;
      },
      status: (value: number) => {
        status = value;
        return response;
      },
      send: (value: string) => {
        body = value;
        return response;
      },
    } as unknown as Response;

    mcpGetNotAllowed({} as Request, response, () => undefined);
    assert.equal(status, 405);
    assert.equal(allow, 'POST');
    assert.equal(body, 'Method Not Allowed');
  });
});
