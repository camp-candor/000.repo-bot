import test from 'ava'
import sinon from 'sinon'
import path from 'path'
import fs from 'fs-extra'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import { flatLibrary } from '../995.library/00.library.unit/buz/library.buzz'

test.serial(
    'flatLibrary [ASTRO_SURFACE_HARVEST] -- ingests Astro src/ tree while quarantining secrets and binaries',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_astro_harvest')
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
        await fs.writeFile(path.join(astroSrcDir, 'index.astro'), '---\nconst title = "Dashboard";\n---\n<h1>{title}</h1>')
        await fs.writeFile(path.join(astroSrcDir, 'styles.css'), 'body { margin: 0; }')
        await fs.writeFile(path.join(astroSrcDir, 'manifest.json'), '{"theme": "dark"}')

        // Quarantined files inside src/
        await fs.writeFile(path.join(astroSrcDir, '.env'), 'SECRET_KEY=leak_attempt')
        await fs.writeFile(path.join(astroSrcDir, '.env.production'), 'PROD_DB=super_secret')
        await fs.writeFile(path.join(astroSrcDir, '.dev.vars'), 'AI_GATEWAY=secret_token')
        await fs.writeFile(path.join(astroSrcDir, 'logo.png'), 'FAKE_BINARY_PNG')
        await fs.writeFile(path.join(astroSrcDir, 'icon.svg'), '<svg>vector_content</svg>')
        await fs.writeFile(path.join(astroSrcDir, 'bundle.js.map'), '{"version":3,"sources":[]}')

        // Excluded src/assets/ directory
        const astroAssetsDir = path.join(astroSrcDir, 'assets')
        await fs.ensureDir(astroAssetsDir)
        await fs.writeFile(path.join(astroAssetsDir, 'hero.svg'), '<svg>hero_vector</svg>')
        await fs.writeFile(path.join(astroAssetsDir, 'notes.txt'), 'ASSET_NOTES')

        // Excluded __snapshots__ directory
        const astroSnapDir = path.join(astroSrcDir, '__snapshots__')
        await fs.ensureDir(astroSnapDir)
        await fs.writeFile(path.join(astroSnapDir, 'index.test.ts.snap'), 'SNAPSHOT_DATA_LEAK')

        // Excluded src/content/ directory
        const astroContentDir = path.join(astroSrcDir, 'content')
        await fs.ensureDir(astroContentDir)
        await fs.writeFile(path.join(astroContentDir, 'post-01.md'), '# Heavy Editorial Post\nAll about markdown prose')
        await fs.writeFile(path.join(astroContentDir, 'docs.mdx'), '# Documentation Article')

        // Excluded public/ directory and worker-configuration.d.ts in workspace root
        const astroPublicDir = path.join(astroAppDir, 'public')
        await fs.ensureDir(astroPublicDir)
        await fs.writeFile(path.join(astroPublicDir, 'bundle.js'), 'PUBLIC_BUNDLE_LEAK')
        await fs.writeFile(path.join(astroAppDir, 'worker-configuration.d.ts'), 'WORKER_CONFIG_TYPINGS_LEAK')

        // Build cache inside .astro/ that must NEVER be ingested
        await fs.writeFile(path.join(astroDotDir, 'astro-types.d.ts'), 'export type AstroCache = true;')

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
        t.true(await fs.pathExists(outputFilePath), 'Flattened ledger output file must exist on disk')

        const flattenedContent = await fs.readFile(outputFilePath, 'utf8')

        // Assert valid Astro surface files were ingested
        t.true(flattenedContent.includes('// ----- SOURCE: apps/000.series-dashboard/src/index.astro -----'))
        t.true(flattenedContent.includes('// ----- SOURCE: apps/000.series-dashboard/src/styles.css -----'))
        t.true(flattenedContent.includes('// ----- SOURCE: apps/000.series-dashboard/src/manifest.json -----'))
        t.true(flattenedContent.includes('// ----- SOURCE: apps/000.series-dashboard/src/content/post-01.md -----'))
        t.true(flattenedContent.includes('Heavy Editorial Post'))
        t.true(flattenedContent.includes('Documentation Article'))

        // Negative control: Assert secrets were quarantined
        t.false(flattenedContent.includes('SECRET_KEY=leak_attempt'), 'Must NOT contain .env secrets')
        t.false(flattenedContent.includes('PROD_DB=super_secret'), 'Must NOT contain .env.production secrets')
        t.false(flattenedContent.includes('AI_GATEWAY=secret_token'), 'Must NOT contain .dev.vars secrets')

        // Negative control: Assert binaries and .astro cache were rejected
        t.false(flattenedContent.includes('FAKE_BINARY_PNG'), 'Must NOT contain binary file content')
        t.false(flattenedContent.includes('astro-types.d.ts'), 'Must NOT harvest .astro internal build cache')

        // Negative control: Assert .svg, src/assets/, __snapshots__, and *.map were rejected
        t.false(flattenedContent.includes('icon.svg'), 'Must NOT contain .svg files')
        t.false(flattenedContent.includes('vector_content'), 'Must NOT contain .svg content')
        t.false(flattenedContent.includes('apps/000.series-dashboard/src/assets/'), 'Must NOT contain src/assets/ files')
        t.false(flattenedContent.includes('ASSET_NOTES'), 'Must NOT contain src/assets/ content')
        t.false(flattenedContent.includes('__snapshots__'), 'Must NOT contain __snapshots__ directory')
        t.false(flattenedContent.includes('SNAPSHOT_DATA_LEAK'), 'Must NOT contain snapshot file content')
        t.false(flattenedContent.includes('bundle.js.map'), 'Must NOT contain *.map files')

        // Negative control: Assert public/ directory and worker-configuration.d.ts were rejected
        t.false(flattenedContent.includes('apps/000.series-dashboard/public/'), 'Must NOT contain public/ directory')
        t.false(flattenedContent.includes('PUBLIC_BUNDLE_LEAK'), 'Must NOT contain public/ bundle content')
        t.false(flattenedContent.includes('worker-configuration.d.ts'), 'Must NOT contain worker-configuration.d.ts')
        t.false(flattenedContent.includes('WORKER_CONFIG_TYPINGS_LEAK'), 'Must NOT contain worker configuration content')

        // Telemetry check
        t.true(loggedLines.some((line) => line.includes('>> [ASTRO] Detected Astro workspace in apps/000.series-dashboard')))
    },
)

test.serial(
    'flatLibrary [ASTRO_SURFACE_HARVEST] -- non-Astro workspaces do not trigger Astro harvester',
    async (t) => {
        const scratchRoot = path.resolve(process.cwd(), 'scratch_test_non_astro')
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
        await fs.writeFile(path.join(plainSrcDir, 'index.astro'), '<h1>Not an Astro Root</h1>')

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
        t.false(flattenedContent.includes('// ----- SOURCE: apps/plain-service/src/index.astro -----'))
    },
)
