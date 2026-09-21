/* eslint-disable */
import 'dotenv/config'
import { program } from 'commander'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const exec = promisify(execCb)

// 1. Setup CLI
program.option('--first').option('-t, --separator <char>')

program.parse(process.argv)
const options = program.opts()

// 2. Logic to run AFTER build
const init = async () => {
    console.log('⚡ Initialization started...')

    const { JSDOM } = require('jsdom') // ✅ Works natively now

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost',
    })

    global.window = dom.window as any // Cast to any to avoid type complaints

    const idx = options.separator
    if (idx) console.log(`   Targeting: ${idx}`)

    const libPath = path.resolve('./dist/995.library')

    try {
        const LIBRARY = require(path.join(libPath, 'hunt'))
        const LIBRARY_ACTION = require(
            path.join(libPath, '00.library.unit/library.action'),
        )

        await LIBRARY.hunt(LIBRARY_ACTION.INIT_LIBRARY, {
            val: 1,
            dat: null,
            src: null,
            idx: idx,
        })

        console.log('✅ Init complete')
    } catch (err) {
        console.error('❌ Runtime Error:', err)
        process.exit(1)
    }
}

// 4. Main Execution Flow
const main = async () => {
    try {
        console.log('🔨 Building TypeScript...')
        // Await the build.
        var { stdout, stderr } = await exec('npx tsc -b 995.library')

        if (stdout) console.log(stdout)
        if (stderr) console.error(stderr)

        await init()
    } catch (err: any) {
        console.error('❌ Build Failed:')
        console.error(err.stdout || err.message)
        process.exit(1)
    }
}

main()
