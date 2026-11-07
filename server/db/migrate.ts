import { loadEnv } from '../env'
import { createDatabase } from './client'

const env = loadEnv()
const database = createDatabase({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR })
await database.migrate()
await database.close()
console.log('Migrations applied')
