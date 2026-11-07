import { mkdirSync } from 'node:fs'
import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import postgres from 'postgres'
import { PGlite } from '@electric-sql/pglite'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

export type DB = PostgresJsDatabase<typeof schema>

export interface Database {
  db: DB
  migrate(): Promise<void>
  ping(): Promise<boolean>
  close(): Promise<void>
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

/**
 * DATABASE_URL set → Postgres (Neon etc.).
 * Otherwise an embedded PGlite database (local dev) — or in-memory when dir is "memory".
 */
export function createDatabase(opts: { url?: string; pgliteDir?: string }): Database {
  if (opts.url) {
    const client = postgres(opts.url, { max: 5, prepare: false })
    const db = drizzlePg(client, { schema })
    return {
      db,
      migrate: () => migratePg(db, { migrationsFolder }),
      ping: async () => { await client`select 1`; return true },
      close: async () => { await client.end() },
    }
  }
  const dir = opts.pgliteDir ?? 'memory'
  if (dir !== 'memory') mkdirSync(dir, { recursive: true })
  const client = dir === 'memory' ? new PGlite() : new PGlite(dir)
  const db = drizzlePglite(client, { schema }) as unknown as DB
  return {
    db,
    migrate: () => migratePglite(db as never, { migrationsFolder }),
    ping: async () => { await client.query('select 1'); return true },
    close: async () => { await client.close() },
  }
}
