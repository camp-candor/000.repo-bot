import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.resolve(__dirname, 'wrangler.jsonc')
let content = fs.readFileSync(configPath, 'utf8')

const d1Id = (process.env.D1_DATABASE_ID || '').trim()

if (d1Id && d1Id !== '00000000-0000-0000-0000-000000000000') {
    content = content.replaceAll('00000000-0000-0000-0000-000000000000', d1Id)
    fs.writeFileSync(configPath, content)
    console.log(
        '>> [D1] Injected D1 database_id from environment variable:',
        d1Id,
    )
} else {
    // Strip d1_databases so Wrangler does not fail on missing placeholder database
    content = content.replace(/"d1_databases"\s*:\s*\[[\s\S]*?\],?/g, '')
    fs.writeFileSync(configPath, content)
    console.log(
        '>> [D1] D1_DATABASE_ID not configured; stripped d1_databases binding for deployment.',
    )
}
