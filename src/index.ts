import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { serve } from '@hono/node-server';

import { Hono } from 'hono';
import { tsImport } from 'tsx/esm/api';
import { HTTPException } from 'hono/http-exception';

export interface PluginOptions {
  customCacheHandler: string;
}

export interface CacheHandler {
  storeFile(hash: string, req: Request): Promise<void>;
  retrieveFile(hash: string): Promise<Response>;
  close?: () => void;
}

interface ServerHandle {
  close(): void;
}

const serverMap = new WeakMap<object, ServerHandle>();

async function preTasksExecution(options: PluginOptions, context: any) {
  const cacheHandlerModule = await tsImport(
    options.customCacheHandler,
    path.join(context.workspaceRoot, 'nx.json')
  );

  const cache: CacheHandler | undefined = cacheHandlerModule.default.default(
    options,
    context
  );

  if (!cache) {
    return;
  }

  const app = new Hono();

  const accessToken = randomBytes(32).toString('base64url');

  app.use(async (ctx, next) => {
    const auth = ctx.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }
    if (auth !== `Bearer ${accessToken}`) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }
    await next();
  });

  app.put('/v1/cache/:hash', async (ctx) => {
    await cache.storeFile(ctx.req.param('hash'), ctx.req.raw);
    return new Response(undefined, { status: 200 });
  });

  app.get('/v1/cache/:hash', async (ctx) => {
    return cache.retrieveFile(ctx.req.param('hash'));
  });

  await new Promise<void>((resolve) => {
    const server = serve({ ...app, port: 0 }, (info) => {
      const host =
        info.family === 'IPv6'
          ? `http://[${info.address}]:${info.port}`
          : `http://${info.address}:${info.port}`;

      process.env.NX_SELF_HOSTED_REMOTE_CACHE_SERVER = host;
      process.env.NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN = accessToken;

      resolve();
    });

    serverMap.set(options, {
      close() {
        server.close();
        cache.close?.();
      },
    });
  });
}

async function postTasksExecution(options: PluginOptions) {
  const server = serverMap.get(options);
  if (!server) {
    return;
  }
  server.close();
  serverMap.delete(options);
}

export default {
  preTasksExecution,
  postTasksExecution,
};
