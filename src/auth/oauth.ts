import { randomBytes, randomUUID } from 'node:crypto';
import type { Client } from 'discord.js';
import type { Application, Response } from 'express';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
  TemporarilyUnavailableError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import * as store from '../db/oauth.repo.js';
import { checkMembershipStatus } from '../discord/permissions.js';
import { buildAuthorizeUrl, exchangeCodeForUserId } from './discord-idp.js';

// guild-mcp сам является Authorization Server для MCP-клиента (Claude), а вход пользователя
// федерирует в Discord (Discord как login-IdP). SDK даёт эндпоинты/PKCE/DCR; здесь — логика провайдера.
// Клиенты/токены/refresh персистятся в SQLite (переживают рестарт); pending/codes — эфемерны, в памяти.

const TOKEN_TTL_S = 3600;
const REFRESH_TTL_MS = 60 * 24 * 3600_000; // 60 дней
const CODE_TTL_MS = 5 * 60_000;
const PENDING_TTL_MS = 10 * 60_000;
// Cap на in-memory коллекции: при переполнении вытесняем старейшую запись (memory-DoS через /authorize).
const MAX_PENDING = 1000;
const MAX_CODES = 1000;

// Map сохраняет порядок вставки → старейший ключ первый. Держим размер ≤ max.
function evictOldest<K, V>(map: Map<K, V>, max: number): void {
  while (map.size >= max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

interface PendingAuth {
  clientId: string;
  codeChallenge: string;
  redirectUri: string; // redirect_uri клиента (валидируется SDK по зарегистрированным)
  clientState?: string;
  expiresAt: number;
}

interface AuthCode {
  codeChallenge: string;
  discordUserId: string;
  clientId: string;
  redirectUri: string;
  expiresAt: number;
}

// OAuth error-redirect в клиент (RFC 6749 §4.1.2.1). Безопасно: redirect_uri провалидирован SDK на /authorize.
function errorRedirect(pend: PendingAuth, error: string, description: string): string {
  const url = new URL(pend.redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (pend.clientState !== undefined) url.searchParams.set('state', pend.clientState);
  return url.href;
}

export class DiscordFederatedProvider implements OAuthServerProvider {
  private readonly pending = new Map<string, PendingAuth>();
  private readonly codes = new Map<string, AuthCode>();

  constructor(
    private readonly config: Config,
    private readonly discord: Client,
    private readonly db: DB,
  ) {}

  private get resource(): string {
    return new URL('/mcp', this.config.PUBLIC_BASE_URL).href;
  }

  private requireResource(resource: URL | undefined): void {
    if (!resource || resource.href !== this.resource) {
      throw new InvalidTargetError(`resource must be ${this.resource}`);
    }
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (id) => store.getClient(this.db, id),
      registerClient: (client) => {
        // SDK уже сгенерил client_id/secret и передал полный объект — только сохраняем.
        const full = client as OAuthClientInformationFull;
        store.saveClient(this.db, full);
        return full;
      },
    };
  }

  // Начало флоу: запоминаем PKCE-challenge клиента и редиректим пользователя на согласие Discord.
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    this.requireResource(params.resource);
    const state = randomUUID();
    evictOldest(this.pending, MAX_PENDING);
    this.pending.set(state, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      clientState: params.state,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
    res.redirect(buildAuthorizeUrl(this.config, state));
  }

  // Обменять discord code → user id, минтить наш auth code, вернуть URL редиректа в MCP-клиент.
  // Ошибки уходят клиенту как OAuth error-redirect (клиент не виснет); throw — лишь на неизвестный
  // state (доверенной цели нет → HTML, иначе open-redirect).
  async handleDiscordCallback(discordCode: string, state: string): Promise<string> {
    const pend = this.pending.get(state);
    if (!pend) throw new Error('unknown state');
    this.pending.delete(state);
    if (pend.expiresAt < Date.now()) {
      return errorRedirect(pend, 'access_denied', 'authorization request expired');
    }

    let discordUserId: string;
    try {
      discordUserId = await exchangeCodeForUserId(this.config, discordCode);
    } catch (e) {
      console.error('discord code exchange failed:', e); // иначе логин-аутэйдж (secret/Discord/сеть) невидим
      return errorRedirect(pend, 'server_error', 'failed to exchange Discord authorization code');
    }

    // Гейт: доступ только тем, кто делит с ботом хотя бы одну гильдию (не чужакам).
    // unavailable (Discord недоступен) НЕ трактуем как отказ — иначе сбой блокировал бы легитимный вход.
    const status = await checkMembershipStatus(this.discord, discordUserId);
    if (status === 'not_member') {
      return errorRedirect(pend, 'access_denied', 'not a member of any Discord server this bot is in');
    }
    if (status === 'unavailable') {
      return errorRedirect(pend, 'temporarily_unavailable', 'Discord is temporarily unavailable');
    }

    const code = randomBytes(32).toString('base64url');
    evictOldest(this.codes, MAX_CODES);
    this.codes.set(code, {
      codeChallenge: pend.codeChallenge,
      discordUserId,
      clientId: pend.clientId,
      redirectUri: pend.redirectUri,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const url = new URL(pend.redirectUri);
    url.searchParams.set('code', code);
    if (pend.clientState !== undefined) url.searchParams.set('state', pend.clientState);
    return url.href;
  }

  // Discord вернул error на своём callback (юзер отказал и т.п.): пробрасываем клиенту как OAuth-ошибку.
  // Возвращает URL редиректа в клиент, либо null если state неизвестен (нет доверенной цели → HTML).
  denyPending(state: string, error: string, description: string): string | null {
    const pend = this.pending.get(state);
    if (!pend) return null;
    this.pending.delete(state);
    return errorRedirect(pend, error, description);
  }

  private getAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): AuthCode {
    // InvalidGrantError → SDK отдаёт 400 invalid_grant; голый Error → 500 (клиент не переавторизуется).
    const c = this.codes.get(authorizationCode);
    if (!c || c.clientId !== client.client_id) throw new InvalidGrantError('invalid authorization code');
    if (c.expiresAt < Date.now()) {
      this.codes.delete(authorizationCode);
      throw new InvalidGrantError('authorization code expired');
    }
    return c;
  }

  // SDK локально валидирует PKCE: S256(code_verifier) должен совпасть с этим challenge.
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    return this.getAuthorizationCode(client, authorizationCode).codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const c = this.getAuthorizationCode(client, authorizationCode);
    // SDK валидирует redirect_uri на /authorize и допускает его отсутствие на обоих запросах.
    // Если клиент повторил параметр на /token, проверяем его согласованность с исходным запросом.
    if (redirectUri !== undefined && redirectUri !== c.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match authorization request');
    }
    // PKCE валидирует SDK; здесь остаётся provider-specific audience binding.
    this.requireResource(resource);
    this.codes.delete(authorizationCode);
    return this.issueTokens(c.discordUserId, client.client_id);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    // InvalidGrantError → SDK отдаёт 400 invalid_grant (клиент переавторизуется);
    // обычный Error SDK мапит в 500 (клиент не перелогинится).
    const r = store.getRefresh(this.db, refreshToken);
    if (!r || r.clientId !== client.client_id) throw new InvalidGrantError('invalid refresh token');
    if (r.expiresAt < Date.now()) {
      store.deleteRefresh(this.db, refreshToken);
      throw new InvalidGrantError('refresh token expired');
    }
    this.requireResource(resource);
    // Членство перепроверяется и на refresh: вышедший из всех гильдий не должен получать свежий
    // access. Проверяем ДО любой мутации строки — на not_member/unavailable ротацию не начинаем.
    const status = await checkMembershipStatus(this.discord, r.discordUserId);
    if (status === 'not_member') {
      store.deleteUserTokens(this.db, r.discordUserId);
      throw new InvalidGrantError('access revoked: no longer a member of any served guild');
    }
    if (status === 'unavailable') {
      // Discord недоступен → выход не подтверждён; строку НЕ трогаем — транзиентный сбой не жжёт
      // сессию, а конкурентный /revoke не «воскрешается» восстановлением. Клиент повторит.
      throw new TemporarilyUnavailableError('membership check unavailable; please retry');
    }
    // Одноразовость под конкуренцией: delete — атомарный claim (delete→issue синхронны, без await между
    // ними), только реально удаливший строку минтит пару; отозванный/проигравший конкурент → invalid_grant.
    if (!store.deleteRefresh(this.db, refreshToken)) {
      throw new InvalidGrantError('invalid refresh token');
    }
    return this.issueTokens(r.discordUserId, client.client_id);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // InvalidTokenError (не обычный Error!) → SDK отдаёт 401, и клиент понимает,
    // что надо переавторизоваться. Обычный Error SDK мапит в 500 (клиент не перелогинится).
    const t = store.getToken(this.db, token);
    if (!t) throw new InvalidTokenError('invalid token');
    if (t.expiresAt < Date.now()) {
      store.deleteToken(this.db, token);
      throw new InvalidTokenError('token expired');
    }
    if (t.resource !== this.resource) {
      throw new InvalidTokenError('token was not issued for this MCP resource');
    }
    // Членство перепроверяется на каждый запрос: вышел/исключён из всех гильдий бота
    // → немедленно разлогиниваем (отзываем все его токены) → 401 → переавторизация.
    const status = await checkMembershipStatus(this.discord, t.discordUserId);
    if (status === 'not_member') {
      store.deleteUserTokens(this.db, t.discordUserId);
      throw new InvalidTokenError('access revoked: no longer a member of any served guild');
    }
    if (status === 'unavailable') {
      // Discord недоступен → выход не подтверждён; токены НЕ трогаем, клиент повторит (SDK → 400, не 401/500).
      throw new TemporarilyUnavailableError('membership check unavailable; please retry');
    }
    return {
      token,
      clientId: t.clientId,
      scopes: t.scopes,
      expiresAt: Math.floor(t.expiresAt / 1000),
      resource: new URL(t.resource),
      extra: { discordUserId: t.discordUserId },
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    store.deleteToken(this.db, request.token);
    store.deleteRefresh(this.db, request.token);
  }

  private issueTokens(discordUserId: string, clientId: string): OAuthTokens {
    const access = randomBytes(32).toString('base64url');
    const refreshTok = randomBytes(32).toString('base64url');
    store.saveToken(this.db, access, {
      discordUserId,
      clientId,
      scopes: [],
      expiresAt: Date.now() + TOKEN_TTL_S * 1000,
      resource: this.resource,
    });
    store.saveRefresh(this.db, refreshTok, {
      discordUserId,
      clientId,
      scopes: [],
      expiresAt: Date.now() + REFRESH_TTL_MS,
    });
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_S,
      refresh_token: refreshTok,
    };
  }

  // Чистка протухшего (вызывается однократно на старте). Expired токены/refresh — из БД;
  // expired pending/codes — из in-memory. Лениво они и так отбрасываются при доступе.
  pruneExpired(): void {
    const now = Date.now();
    store.deleteExpired(this.db, now);
    for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt < now) this.codes.delete(k);
  }
}

// Монтирует OAuth-эндпойнты SDK (в корень) + наш Discord-callback.
export function mountAuth(app: Application, config: Config, provider: DiscordFederatedProvider): void {
  const issuerUrl = new URL(config.PUBLIC_BASE_URL);
  const resourceServerUrl = new URL('/mcp', config.PUBLIC_BASE_URL);

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      resourceName: 'guild-mcp',
      resourceServerUrl,
    }),
  );

  const callbackPath = new URL(config.OAUTH_REDIRECT_URI).pathname;
  app.get(callbackPath, (req, res) => {
    const { code, state, error } = req.query;
    if (typeof state !== 'string') {
      res.status(400).send('missing state'); // без state нет доверенной цели редиректа
      return;
    }
    // Discord вернул ошибку (юзер отказал в согласии и т.п.) → пробрасываем клиенту как access_denied.
    if (typeof error === 'string') {
      const redirect = provider.denyPending(state, 'access_denied', 'Discord authorization was denied');
      if (redirect) res.redirect(redirect);
      else res.status(400).send('Authorization denied.');
      return;
    }
    if (typeof code !== 'string') {
      res.status(400).send('missing code');
      return;
    }
    provider
      .handleDiscordCallback(code, state)
      .then((redirect) => res.redirect(redirect))
      .catch((e: unknown) => {
        // Сюда доходит только неизвестный state (нет доверенного redirect_uri) — показываем HTML.
        console.error('oauth callback error:', e);
        res.status(400).send('OAuth callback failed.');
      });
  });
}
