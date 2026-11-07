import { existsSync } from 'node:fs'
import { z } from 'zod'

// Load .env (Node ≥ 20.12 built-in). Real environment variables always win.
if (existsSync('.env')) {
  try { process.loadEnvFile('.env') } catch (e) { console.warn('[loadup] could not read .env:', (e as Error).message) }
}

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8787),
  PUBLIC_APP_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional().default(''),
  PGLITE_DIR: z.string().optional().default('./.data/pglite'),
  SESSION_SECRET: z.string().optional().default(''),
  DATA_ENCRYPTION_KEY: z.string().optional().default(''),
  TOPUP_PROVIDER: z.enum(['bitrefill', 'mock']).default('bitrefill'),
  BITREFILL_BASE_URL: z.string().default('https://api.bitrefill.com/v2'),
  BITREFILL_API_KEY: z.string().optional().default(''),
  BITREFILL_API_ID: z.string().optional().default(''),
  BITREFILL_API_SECRET: z.string().optional().default(''),
  WEBHOOK_TOKEN: z.string().optional().default(''),
  LIMIT_PER_ORDER_USD: z.coerce.number().positive().default(100),
  LIMIT_PER_DAY_USD: z.coerce.number().positive().default(300),
  SUPPORT_EMAIL: z.string().optional().default(''),
  SUPPORT_URL: z.string().optional().default(''),
  CRON_SECRET: z.string().optional().default(''),
})

export type Env = z.infer<typeof schema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = schema.parse(source)
  const prod = env.NODE_ENV === 'production'
  if (prod) {
    const missing: string[] = []
    if (!env.DATABASE_URL) missing.push('DATABASE_URL')
    if (env.SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (≥32 chars)')
    if (!env.DATA_ENCRYPTION_KEY) missing.push('DATA_ENCRYPTION_KEY')
    if (env.TOPUP_PROVIDER === 'mock') missing.push('TOPUP_PROVIDER must be bitrefill in production')
    if (missing.length) throw new Error('Missing/invalid production config: ' + missing.join(', '))
  } else {
    // Development defaults so `npm run dev` works out of the box. Never used in production.
    if (!env.SESSION_SECRET) env.SESSION_SECRET = 'dev-only-session-secret-change-me-0000000000'
    if (!env.DATA_ENCRYPTION_KEY) env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  }
  return env
}
