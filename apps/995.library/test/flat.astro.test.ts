import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import { flatLibrary } from '../995.library/00.library.unit/buz/library.buzz'

test.serial(
    'flatLibrary [ASTRO_SURFACE_HARVEST] -- ingests Astro src/ tree while quarantining secrets and binaries',
    async (t) => {
        const scratchRoot = path.resolve(
            process.cwd(),
            'scratch_test_astro_harvest',
        )
        await fs.ensureDir(scratchRoot)

        const appsDir = path.join(scratchRoot, 'apps')
        const packagesDir = path.join(scratchRoot, 'packages')
        const astroAppDir = path.join(appsDir, '000.series-dashboard')
        const astroDotDir = path.join(astroAppDir, '.astro')
        const astroSrcDir = path.join(astroAppDir, 'src')

        await fs.ensureDir(astroDotDir)
        await fs.ensureDir(astroSrcDir)
        await fs.ensureDir(packagesDir)

        // Root monorepo anchors
        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'test-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        // Valid Astro source files
        await fs.writeFile(
            path.join(astroSrcDir, 'index.astro'),
            '---\nconst title = "Dashboard";\n---\n<h1>{title}</h1>',
        )
        await fs.writeFile(
            path.join(astroSrcDir, 'styles.css'),
            'body { margin: 0; }',
        )
        await fs.writeFile(
            path.join(astroSrcDir, 'manifest.json'),
            '{"theme": "dark"}',
        )

        // Quarantined files inside src/
        await fs.writeFile(
            path.join(astroSrcDir, '.env'),
            'SECRET_KEY=leak_attempt',
        )
        await fs.writeFile(
            path.join(astroSrcDir, '.env.production'),
            'PROD_DB=super_secret',
        )
        await fs.writeFile(
            path.join(astroSrcDir, '.dev.vars'),
            'AI_GATEWAY=secret_token',
        )
        await fs.writeFile(
            path.join(astroSrcDir, 'logo.png'),
            'FAKE_BINARY_PNG',
        )

        // Build cache inside .astro/ that must NEVER be ingested
        await fs.writeFile(
            path.join(astroDotDir, 'astro-types.d.ts'),
            'export type AstroCache = true;',
        )

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const loggedLines: string[] = []
        const mockSte: any = {
            hunt: sinon.spy(async (actionType: string, payload: any) => {
                if (payload?.src) loggedLines.push(payload.src)
                return {}
            }),
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await flatLibrary(new LibraryModel(), bal as any, mockSte)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult, 'flatLibrary must resolve bal.slv')
        t.is(resolvedResult.libBit.idx, 'flat-library')

        const outputFilePath = path.join(scratchRoot, resolvedResult.libBit.src)
        t.true(
            await fs.pathExists(outputFilePath),
            'Flattened ledger output file must exist on disk',
        )

        const flattenedContent = await fs.readFile(outputFilePath, 'utf8')

        // Assert valid Astro surface files were ingested
        t.true(
            flattenedContent.includes(
                '// ----- SOURCE: apps/000.series-dashboard/src/index.astro -----',
            ),
        )
        t.true(
            flattenedContent.includes(
                '// ----- SOURCE: apps/000.series-dashboard/src/styles.css -----',
            ),
        )
        t.true(
            flattenedContent.includes(
                '// ----- SOURCE: apps/000.series-dashboard/src/manifest.json -----',
            ),
        )

        // Negative control: Assert secrets were quarantined
        t.false(
            flattenedContent.includes('SECRET_KEY=leak_attempt'),
            'Must NOT contain .env secrets',
        )
        t.false(
            flattenedContent.includes('PROD_DB=super_secret'),
            'Must NOT contain .env.production secrets',
        )
        t.false(
            flattenedContent.includes('AI_GATEWAY=secret_token'),
            'Must NOT contain .dev.vars secrets',
        )

        // Negative control: Assert binaries and .astro cache were rejected
        t.false(
            flattenedContent.includes('FAKE_BINARY_PNG'),
            'Must NOT contain binary file content',
        )
        t.false(
            flattenedContent.includes('astro-types.d.ts'),
            'Must NOT harvest .astro internal build cache',
        )

        // Telemetry check
        t.true(
            loggedLines.some((line) =>
                line.includes(
                    '>> [ASTRO] Detected Astro workspace in apps/000.series-dashboard',
                ),
            ),
        )
    },
)

test.serial(
    'flatLibrary [ASTRO_SURFACE_HARVEST] -- non-Astro workspaces do not trigger Astro harvester',
    async (t) => {
        const scratchRoot = path.resolve(
            process.cwd(),
            'scratch_test_non_astro',
        )
        await fs.ensureDir(scratchRoot)

        const appsDir = path.join(scratchRoot, 'apps')
        const plainAppDir = path.join(appsDir, 'plain-service')
        const plainSrcDir = path.join(plainAppDir, 'src')

        await fs.ensureDir(plainSrcDir)
        await fs.ensureDir(path.join(scratchRoot, 'packages'))

        await fs.writeJson(path.join(scratchRoot, 'package.json'), {
            name: 'plain-monorepo',
            workspaces: ['apps/*', 'packages/*'],
        })

        // Plain workspace has index.astro but lacks .astro sentinel folder
        await fs.writeFile(
            path.join(plainSrcDir, 'index.astro'),
            '<h1>Not an Astro Root</h1>',
        )

        t.teardown(async () => {
            await fs.remove(scratchRoot).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        const originalCwd = process.cwd
        process.cwd = () => scratchRoot

        try {
            await flatLibrary(new LibraryModel(), bal as any, null as any)
        } finally {
            process.cwd = originalCwd
        }

        t.truthy(resolvedResult)
        const outputFilePath = path.join(scratchRoot, resolvedResult.libBit.src)
        const flattenedContent = await fs.readFile(outputFilePath, 'utf8')

        // Without .astro folder, standard CODE_EXTS applies; index.astro is omitted
        t.false(
            flattenedContent.includes(
                '// ----- SOURCE: apps/plain-service/src/index.astro -----',
            ),
        )
    },
)
