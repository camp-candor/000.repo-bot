/* eslint-disable */
import 'dotenv/config'
import { program } from 'commander'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const exec = promisify(execCb)

// 1. Setup CLI
program.option('--first').option('-t, --separator <char>')

program.parse(process.argv)
const options = program.opts()

// 2. Logic to run AFTER build
const init = async () => {
    console.log('⚡ Initialization started...')

    global.window = global as any

    const idx = options.separator
    if (idx) console.log(`   Targeting: ${idx}`)

    const libPath = path.resolve(import.meta.dirname, './dist/995.library')
    const agtPath = path.resolve(
        import.meta.dirname,
        '../../packages/dist/000.agent',
    )
    const rbtPath = path.resolve(
        import.meta.dirname,
        '../../packages/dist/821.repobot',
    )
    const cfPath = path.resolve(
        import.meta.dirname,
        '../../packages/dist/822.cloudflare',
    )
    const jlsPath = path.resolve(
        import.meta.dirname,
        '../../packages/dist/823.jules',
    )

    try {
        const LIBRARY = require(path.join(libPath, 'hunt'))
        global.LIBRARY = LIBRARY

        const LIBRARY_ACTION = require(
            path.join(libPath, '00.library.unit/library.action'),
        )

        await LIBRARY.hunt(LIBRARY_ACTION.INIT_LIBRARY, {
            val: 1,
            dat: null,
            src: null,
            idx: idx,
        })

        try {
            const AGENT = require(path.join(agtPath, 'hunt'))
            global.AGENT = AGENT.default || AGENT

            const MENU_ACTION_LIBRARY = require(
                path.join(libPath, '98.menu.unit/menu.action'),
            )
            const MENU_ACTION_AGENT = require(
                path.join(agtPath, '98.menu.unit/menu.action'),
            )

            await new Promise((resolve) => setTimeout(resolve, 10))

            await LIBRARY.hunt(MENU_ACTION_LIBRARY.PRINT_MENU, {
                src: '✅ Init complete',
            })

            // Register AGENT MENU into the Blessed Menu registry
            await LIBRARY.hunt(MENU_ACTION_LIBRARY.ROUTE_MENU, {
                idx: 'AGENT MENU',
                src: 'Open the Agent menu\nto manage agents.',
                fnc: async () => {
                    await new Promise<void>((resolve) => {
                        global.AGENT.hunt(MENU_ACTION_AGENT.INIT_MENU, {
                            slv: resolve,
                        })
                    })
                    await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, {
                        src: '',
                    })
                },
            })

            // Register REPOBOT MENU into the Blessed Menu registry
            try {
                const REPOBOT = require(path.join(rbtPath, 'hunt'))
                global.REPOBOT = REPOBOT.default || REPOBOT

                const MENU_ACTION_REPOBOT = require(
                    path.join(rbtPath, '98.menu.unit/menu.action'),
                )

                await LIBRARY.hunt(MENU_ACTION_LIBRARY.ROUTE_MENU, {
                    idx: 'REPOBOT MENU',
                    src: 'Open the Repobot menu\nto manage repobots.',
                    fnc: async () => {
                        await new Promise<void>((resolve) => {
                            global.REPOBOT.hunt(MENU_ACTION_REPOBOT.INIT_MENU, {
                                slv: resolve,
                            })
                        })
                        await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, {
                            src: '',
                        })
                    },
                })
            } catch (err) {
                console.error(`exec error loading repobot: ${err}`)
                throw err
            }

            // Register CLOUDFLARE MENU into the Blessed Menu registry
            try {
                const CLOUDFLARE = require(path.join(cfPath, 'hunt'))
                global.CLOUDFLARE = CLOUDFLARE.default || CLOUDFLARE

                const MENU_ACTION_CLOUDFLARE = require(
                    path.join(cfPath, '98.menu.unit/menu.action'),
                )

                await LIBRARY.hunt(MENU_ACTION_LIBRARY.ROUTE_MENU, {
                    idx: 'CLOUDFLARE MENU',
                    src: 'Open the Cloudflare menu\nto manage cloudflare.',
                    fnc: async () => {
                        await new Promise<void>((resolve) => {
                            global.CLOUDFLARE.hunt(
                                MENU_ACTION_CLOUDFLARE.INIT_MENU,
                                {
                                    slv: resolve,
                                },
                            )
                        })
                        await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, {
                            src: '',
                        })
                    },
                })
            } catch (err) {
                console.error(`exec error loading cloudflare: ${err}`)
                throw err
            }

            // Register JULES MENU into the Blessed Menu registry
            try {
                const JULES = require(path.join(jlsPath, 'hunt'))
                global.JULES = JULES.default || JULES

                const MENU_ACTION_JULES = require(
                    path.join(jlsPath, '98.menu.unit/menu.action'),
                )

                await LIBRARY.hunt(MENU_ACTION_LIBRARY.ROUTE_MENU, {
                    idx: 'JULES MENU',
                    src: 'Open the Jules menu\nto manage jules.',
                    fnc: async () => {
                        await new Promise<void>((resolve) => {
                            global.JULES.hunt(MENU_ACTION_JULES.INIT_MENU, {
                                slv: resolve,
                            })
                        })
                        await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, {
                            src: '',
                        })
                    },
                })
            } catch (err) {
                console.error(`exec error loading jules: ${err}`)
                throw err
            }

            await LIBRARY.hunt(MENU_ACTION_LIBRARY.OPEN_MENU, { src: '' })
        } catch (err) {
            console.error(`exec error loading agent: ${err}`)
            throw err
        }
    } catch (err) {
        console.error('❌ Runtime Error:', err)
        process.exit(1)
    }
}

// 3. Main Execution Flow: Build library, agent, repobot, cloudflare, and jules packages
const main = async () => {
    try {
        console.log('🔨 Building TypeScript...')
        var { stdout, stderr } = await exec(
            'tsc -b 995.library ../../packages/000.agent ../../packages/821.repobot ../../packages/822.cloudflare ../../packages/823.jules',
            { cwd: import.meta.dirname },
        )

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
