import express, { type Application, type RequestHandler } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from '../config.js';
import { DiscordFederatedProvider, mountAuth } from '../auth/oauth.js';
import { createMcpServer, type ToolDeps } from '../mcp/server.js';

// HTTP-слой на express: OAuth-слой SDK (mcpAuthRouter/requireBearerAuth) express-нативен.
export function createHttpServer(config: Config, deps: ToolDeps): Application {
  const app = express();

  const provider = new DiscordFederatedProvider(config, deps.discord, deps.db);
  provider.pruneExpired(); // однократная чистка протухших токенов на старте
  mountAuth(app, config, provider); // OAuth-эндпойнты + Discord-callback

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL('/mcp', config.PUBLIC_BASE_URL)),
  });

  // Fail-closed на неготовый/потерявший сессию Discord-клиент. Стоит ПЕРЕД bearer: verifyAccessToken
  // тоже бьёт Discord (гейт членства) — без готового клиента он не должен исполняться вовсе.
  const requireDiscordReady: RequestHandler = (_req, res, next) => {
    if (!deps.discord.isReady()) {
      // /mcp — JSON-RPC-транспорт → отвечаем конвертом (id недоступен до express.json → null).
      res.status(503).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Discord connection is not ready; retry later.' },
      });
      return;
    }
    next();
  };

  // MCP Streamable HTTP на /mcp, за bearer. Stateless: сервер+транспорт на запрос;
  // проверенная identity из req.auth пробрасывается транспортом в extra.authInfo тулов.
  app.post('/mcp', requireDiscordReady, bearer, express.json(), async (req, res) => {
    const server = createMcpServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}
