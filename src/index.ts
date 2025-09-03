import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { serve, ServerType } from '@hono/node-server';

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createMiddleware } from 'hono/factory';
import { tsImport } from 'tsx/esm/api';

export interface PluginOptions {
  customCacheHandler: string;
}

export interface CacheHandler {
  storeFile(hash: string, req: Request): Promise<void>;
  retrieveFile(hash: string): Promise<Response>;
}

const serverMap = new WeakMap<object, ServerType>();

async function preTasksExecution(options: PluginOptions, context: any) {
  const cacheHandlerModule = await tsImport(
    options.customCacheHandler,
    path.join(context.workspaceRoot, 'nx.json')
  );

  const cache: CacheHandler | undefined = cacheHandlerModule.default.default();
  if (!cache) {
    console.log('[NX Custom Cache Server] missing cache handler');
    return;
  }

  const app = new Hono();

  app.use(
    logger((...args) => {
      console.log('[NX Custom Cache Server]', ...args);
    })
  );

  const accessToken = randomBytes(32).toString('base64url');

  app.use(
    createMiddleware(async (ctx, next) => {
      const auth = ctx.req.header('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return new Response('Unauthorized', { status: 401 });
      }
      if (auth !== `Bearer ${accessToken}`) {
        return new Response('Forbidden', { status: 403 });
      }
      await next();
    })
  );

  app.put('/v1/cache/:hash', async (ctx) => {
    await cache.storeFile(ctx.req.param('hash'), ctx.req.raw);
    return new Response(undefined, { status: 200 });
  });

  app.get('/v1/cache/:hash', async (ctx) => {
    return cache.retrieveFile(ctx.req.param('hash'));
  });

  const server = serve({ ...app, port: 0 }, (info) => {
    const host =
      info.family === 'IPv6'
        ? `http://[${info.address}]:${info.port}`
        : `http://${info.address}:${info.port}`;

    process.env.NX_SELF_HOSTED_REMOTE_CACHE_SERVER = host;
    process.env.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN = accessToken;

    console.log('[NX Custom Cache Server] cache server listening', host);
  });

  serverMap.set(options, server);
}

async function postTasksExecution(options: PluginOptions) {
  const server = serverMap.get(options);
  if (!server) {
    console.warn('[NX Custom Cache Server] missing cache server');
    return;
  }
  server.close();
  serverMap.delete(options);
  console.log('[NX Custom Cache Server] cache server closed');
}

export default {
  preTasksExecution,
  postTasksExecution,
};
