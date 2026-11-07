import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import { loadEnv } from './env'
import { createDatabase } from './db/client'
import { createProvider } from './providers'
import { createApp } from './app'

const env = loadEnv()
const database = createDatabase({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR })
await database.migrate()
const provider = createProvider(env)
const { app, runCron } = createApp({ env, database, provider })

// Serve the built Mini App (single origin = no CORS, one stable URL).
if (existsSync('./dist/index.html')) {
  const indexHtml = readFileSync('./dist/index.html', 'utf8')
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.use('*', serveStatic({ root: './dist' }))
  app.get('*', (c) => c.html(indexHtml))
}

// Cron: every minute poll open invoices and expire stale ones.
let running = false
setInterval(async () => {
  if (running) return
  running = true
  try { await runCron() } catch (e) { console.error('[loadup] cron failed', e) } finally { running = false }
}, 60_000).unref()

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(`[loadup] API on http://localhost:${info.port} · provider=${provider.name}${provider.configured() ? '' : ' (NOT CONFIGURED)'} · db=${env.DATABASE_URL ? 'postgres' : 'pglite'}`)
})
