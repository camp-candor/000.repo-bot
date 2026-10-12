import path from 'path'
import fs from 'fs-extra'
import { LibraryModel } from '../995.library/00.library.unit/library.model'
import { promisify } from 'util'
import { execFile } from 'child_process'
import test from 'ava'
import sinon from 'sinon'
import {
    resolveFleetRoot,
    scanFleet,
    checkGitWorkingTree,
    resolveGitRoot,
    progressLibrarySaga,
    filterZeroTrust,
    retryAtomicRename,
    swapAtomicInodes,
    stageLibraryPayload,
    writeSagaJournal,
    rollbackSagaJournal,
    finalizeSagaJournal,
    getJournalPath,
    type SagaJournal,
    auditLibrary,
} from '../995.library/00.library.unit/buz/library.buzz'

const cleanEnv = () => {
    delete process.env.FLEET_ROOT
    delete process.env.WORK_DIR
}

test.beforeEach(() => {
    cleanEnv()
})

test.afterEach(() => {
    cleanEnv()
})

// ============================================================================
// SUITE 1: ANCHOR RESOLUTION POSITIVE & NEGATIVE CONTROLS
// ============================================================================

test.serial(
    'resolveFleetRoot -- prioritizes process.env.FLEET_ROOT over filesystem search',
    async (t) => {
        const scratchDir = path.resolve(process.cwd(), 'scratch_test_fleet_env')
        await fs.ensureDir(scratchDir)

        t.teardown(async () => {
            await fs.remove(scratchDir).catch(() => {})
        })

        process.env.FLEET_ROOT = scratchDir
        const resolved = resolveFleetRoot('/some/arbitrary/nested/path')

        t.is(
            resolved,
            scratchDir,
            'Must directly resolve FLEET_ROOT when directory exists',
        )
    },
)

test.serial(
    'resolveFleetRoot [NEG_CONTROL] -- falls back when FLEET_ROOT directory does not exist',
    async (t) => {
        process.env.FLEET_ROOT = '/nonexistent/phantom/fleet/root'
        const scratchWorkDir = path.resolve(
            process.cwd(),
            'scratch_test_fallback_work_env',
        )
        await fs.ensureDir(scratchWorkDir)

        t.teardown(async () => {
            await fs.remove(scratchWorkDir).catch(() => {})
        })

        process.env.WORK_DIR = scratchWorkDir
        const resolved = resolveFleetRoot('/some/arbitrary/nested/path')

        t.is(
            resolved,
            scratchWorkDir,
            'Must fall back to WORK_DIR when FLEET_ROOT does not exist on disk',
        )
    },
)

test.serial(
    'resolveFleetRoot [NEG_CONTROL] -- ignores FLEET_ROOT when pointing to regular file',
    async (t) => {
        const scratchFile = path.resolve(
            process.cwd(),
            'scratch_test_fleet_file.txt',
        )
        await fs.writeFile(scratchFile, 'NOT_A_DIRECTORY')

        t.teardown(async () => {
            await fs.remove(scratchFile).catch(() => {})
        })

        process.env.FLEET_ROOT = scratchFile
        const scratchWorkDir = path.resolve(
            process.cwd(),
            'scratch_test_work_from_file_fallback',
        )
        await fs.ensureDir(scratchWorkDir)

        t.teardown(async () => {
            await fs.remove(scratchWorkDir).catch(() => {})
        })

        process.env.WORK_DIR = scratchWorkDir
        const resolved = resolveFleetRoot('/some/arbitrary/nested/path')

        t.is(
            resolved,
            scratchWorkDir,
            'Must ignore FLEET_ROOT when path is a file and fall back to WORK_DIR',
        )
    },
)

test.serial(
    'resolveFleetRoot -- prioritizes process.env.WORK_DIR when FLEET_ROOT is absent',
    async (t) => {
        const scratchDir = path.resolve(
            process.cwd(),
            'scratch_test_work_dir_env',
        )
        await fs.ensureDir(scratchDir)

        t.teardown(async () => {
            await fs.remove(scratchDir).catch(() => {})
        })

        process.env.WORK_DIR = scratchDir
        const resolved = resolveFleetRoot('/some/arbitrary/nested/path')

        t.is(
            resolved,
            scratchDir,
            'Must resolve WORK_DIR when FLEET_ROOT is omitted',
        )
    },
)

test.serial(
    'resolveFleetRoot -- crawls upward to discover camp-candor-cauldron sentinel',
    async (t) => {
        const mockRoot = path.resolve(
            process.cwd(),
            'scratch_test_cauldron_root',
        )
        const cauldronDir = path.join(mockRoot, 'camp-candor-cauldron')
        const deepNested = path.join(
            mockRoot,
            '02.simulation',
            '002.worker',
            'src',
        )

        await fs.ensureDir(deepNested)
        await fs.ensureDir(cauldronDir)
        await fs.writeFile(
            path.join(cauldronDir, 'versions.json'),
            '{"sovereign_repo": "000.repo-bot"}',
        )

        t.teardown(async () => {
            await fs.remove(mockRoot).catch(() => {})
        })

        const resolved = resolveFleetRoot(deepNested)
        t.is(
            resolved,
            mockRoot,
            'Must identify parent of camp-candor-cauldron as FLEET_ROOT',
        )
    },
)

test.serial(
    'resolveFleetRoot -- crawls upward from nested cauldron subdirectory to discover root',
    async (t) => {
        const mockRoot = path.resolve(
            process.cwd(),
            'scratch_test_cauldron_inner',
        )
        const cauldronDir = path.join(mockRoot, 'camp-candor-cauldron')

        await fs.ensureDir(cauldronDir)
        await fs.writeFile(
            path.join(cauldronDir, 'versions.json'),
            '{"sovereign_repo": "000.repo-bot"}',
        )

        t.teardown(async () => {
            await fs.remove(mockRoot).catch(() => {})
        })

        const resolved = resolveFleetRoot(cauldronDir)
        t.is(
            resolved,
            mockRoot,
            'Must identify parent of camp-candor-cauldron when starting inside it',
        )
    },
)

test.serial(
    'resolveFleetRoot -- discovers multi-tenant organizational cluster folders',
    async (t) => {
        const mockRoot = path.resolve(
            process.cwd(),
            'scratch_test_org_clusters',
        )
        const orgDirA = path.join(mockRoot, 'campc-it-com', '000.repo-bot')
        const orgDirB = path.join(mockRoot, 'astro-kahn-it-com')
        const deepNested = path.join(orgDirA, 'apps', '995.library')

        await fs.ensureDir(deepNested)
        await fs.ensureDir(orgDirB)

        t.teardown(async () => {
            await fs.remove(mockRoot).catch(() => {})
        })

        const resolved = resolveFleetRoot(deepNested)
        t.is(
            resolved,
            mockRoot,
            'Must resolve directory containing known organization clusters',
        )
    },
)

test.serial(
    'resolveFleetRoot [NEG_CONTROL] -- bypasses /home/runner/work without sentinels',
    async (t) => {
        const runnerPath = '/home/runner/work/some-repo/some-repo'
        const resolved = resolveFleetRoot(runnerPath)

        t.is(
            resolved,
            null,
            'Must fail closed to null when no sentinels exist along runner path',
        )
    },
)

test.serial(
    'resolveFleetRoot [NEG_CONTROL] -- safely terminates at filesystem root returning null',
    async (t) => {
        const isolatedDir = path.resolve(
            process.cwd(),
            'scratch_test_isolated_empty',
        )
        await fs.ensureDir(isolatedDir)

        t.teardown(async () => {
            await fs.remove(isolatedDir).catch(() => {})
        })

        const resolved = resolveFleetRoot(isolatedDir)
        if (resolved !== null) {
            t.truthy(
                resolved,
                'Resolves upper workspace if present in active development environment',
            )
        } else {
            t.is(
                resolved,
                null,
                'Returns null when filesystem root reached without sentinels',
            )
        }
    },
)

// ============================================================================
// SUITE 2: FLEET DISCOVERY & SCANNING RESILIENCY GAUNTLET
// ============================================================================

test.serial(
    'scanFleet -- discovers apps/995.library across multi-tenant organization directories',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_fleet_scan',
        )
        const repoA = path.join(mockFleetRoot, 'campc-it-com', '000.repo-bot')
        const repoB = path.join(
            mockFleetRoot,
            'astro-kahn-it-com',
            '001.goblin-lore',
        )
        const repoC = path.join(
            mockFleetRoot,
            'slopratchet.com',
            '999.plain-service',
        )

        await fs.ensureDir(path.join(repoA, 'apps', '995.library'))
        await fs.writeFile(
            path.join(repoA, 'package.json'),
            '{"name":"repo-bot"}',
        )

        await fs.ensureDir(path.join(repoB, 'apps', '995.library'))
        await fs.writeFile(
            path.join(repoB, 'package.json'),
            '{"name":"goblin-lore"}',
        )

        await fs.ensureDir(path.join(repoC, 'src'))
        await fs.writeFile(
            path.join(repoC, 'package.json'),
            '{"name":"plain-service"}',
        )

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any
        const ste = null as any

        await scanFleet(model, bal, ste)

        t.true(slv.calledOnce, 'bal.slv must be invoked exactly once')
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet')
        t.is(payload.libBit.val, 2)
        t.deepEqual(payload.libBit.lst, [
            '[astro-kahn-it-com/001.goblin-lore/apps/995.library]',
            '[campc-it-com/000.repo-bot/apps/995.library]',
        ])
    },
)

test.serial(
    'scanFleet -- discovers targeted package pivot when bal.src is provided',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_pivot_scan',
        )
        const repoA = path.join(mockFleetRoot, 'campc-it-com', '000.repo-bot')
        const repoB = path.join(
            mockFleetRoot,
            'astro-kahn-it-com',
            '001.goblin-lore',
        )

        await fs.ensureDir(path.join(repoA, 'packages', '133.cloudflare'))
        await fs.writeFile(
            path.join(repoA, 'package.json'),
            '{"name":"repo-bot"}',
        )

        await fs.ensureDir(path.join(repoB, 'packages', '001.lore'))
        await fs.writeFile(
            path.join(repoB, 'package.json'),
            '{"name":"goblin-lore"}',
        )

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { src: '[133.cloudflare]', slv } as any
        const ste = null as any

        await scanFleet(model, bal, ste)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet')
        t.is(payload.libBit.val, 1)
        t.deepEqual(payload.libBit.lst, [
            '[campc-it-com/000.repo-bot/packages/133.cloudflare]',
        ])
    },
)

test.serial(
    'scanFleet [NEG_CONTROL] -- normalizes messy pivot inputs with brackets and whitespace',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_pivot_messy',
        )
        const repoA = path.join(mockFleetRoot, 'campc-it-com', '000.repo-bot')

        await fs.ensureDir(path.join(repoA, 'packages', '133.cloudflare'))
        await fs.writeFile(
            path.join(repoA, 'package.json'),
            '{"name":"repo-bot"}',
        )

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { src: '   [[ 133.cloudflare ]]   ', slv } as any

        await scanFleet(model, bal, null as any)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet')
        t.is(payload.libBit.val, 1)
        t.deepEqual(payload.libBit.lst, [
            '[campc-it-com/000.repo-bot/packages/133.cloudflare]',
        ])
    },
)

test.serial(
    'scanFleet [NEG_CONTROL] -- returns empty list cleanly when target pivot does not exist',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_empty_pivot',
        )
        const repoA = path.join(mockFleetRoot, 'campc-it-com', '000.repo-bot')
        await fs.ensureDir(path.join(repoA, 'packages', '100.agent'))
        await fs.writeFile(
            path.join(repoA, 'package.json'),
            '{"name":"repo-bot"}',
        )

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { src: '999.nonexistent', slv } as any
        const ste = null as any

        await scanFleet(model, bal, ste)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet')
        t.is(payload.libBit.val, 0)
        t.deepEqual(payload.libBit.lst, [])
    },
)

test.serial(
    'scanFleet [NEG_CONTROL] -- strictly ignores blacklisted directories',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_ignored_dirs',
        )
        const validRepo = path.join(mockFleetRoot, 'org-a', '000.valid-repo')
        const ignoredGit = path.join(mockFleetRoot, '.git', '000.decoy-repo')
        const ignoredNodeModules = path.join(
            mockFleetRoot,
            'node_modules',
            '000.decoy-repo',
        )
        const ignoredWrangler = path.join(
            mockFleetRoot,
            '.wrangler',
            '000.decoy-repo',
        )
        const ignoredDist = path.join(mockFleetRoot, 'dist', '000.decoy-repo')

        // Scaffolding valid repository
        await fs.ensureDir(path.join(validRepo, 'apps', '995.library'))
        await fs.writeFile(path.join(validRepo, 'package.json'), '{}')

        // Scaffolding decoy repositories inside blacklisted directory trees
        await fs.ensureDir(path.join(ignoredGit, 'apps', '995.library'))
        await fs.ensureDir(path.join(ignoredNodeModules, 'apps', '995.library'))
        await fs.ensureDir(path.join(ignoredWrangler, 'apps', '995.library'))
        await fs.ensureDir(path.join(ignoredDist, 'apps', '995.library'))

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any

        await scanFleet(model, bal, null as any)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(
            payload.libBit.val,
            1,
            'Must strictly identify only the valid repo, ignoring blacklisted directories',
        )
        t.deepEqual(payload.libBit.lst, [
            '[org-a/000.valid-repo/apps/995.library]',
        ])
    },
)

test.serial(
    'scanFleet -- handles direct root repository layout alongside nested org clusters',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_mixed_layout',
        )
        const directRepo = path.join(mockFleetRoot, '000.direct-server')
        const nestedRepo = path.join(
            mockFleetRoot,
            'campc-it-com',
            '000.repo-bot',
        )

        await fs.ensureDir(path.join(directRepo, 'apps', '995.library'))
        await fs.writeFile(
            path.join(directRepo, 'package.json'),
            '{"name":"direct-server"}',
        )

        await fs.ensureDir(path.join(nestedRepo, 'apps', '995.library'))
        await fs.writeFile(
            path.join(nestedRepo, 'package.json'),
            '{"name":"repo-bot"}',
        )

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any
        const ste = null as any

        await scanFleet(model, bal, ste)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.val, 2)
        t.deepEqual(payload.libBit.lst, [
            '[000.direct-server/apps/995.library]',
            '[campc-it-com/000.repo-bot/apps/995.library]',
        ])
    },
)

test.serial(
    'scanFleet -- formats bracket paths and sorts alphabetically',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_formatting_sort',
        )
        const repoZ = path.join(mockFleetRoot, 'zeta-org', '999.zeta-bot')
        const repoA = path.join(mockFleetRoot, 'alpha-org', '000.alpha-bot')
        const repoM = path.join(mockFleetRoot, 'middle-org', '100.middle-bot')

        await fs.ensureDir(path.join(repoZ, 'apps', '995.library'))
        await fs.writeFile(path.join(repoZ, 'package.json'), '{}')

        await fs.ensureDir(path.join(repoA, 'apps', '995.library'))
        await fs.writeFile(path.join(repoA, 'package.json'), '{}')

        await fs.ensureDir(path.join(repoM, 'apps', '995.library'))
        await fs.writeFile(path.join(repoM, 'package.json'), '{}')

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any

        await scanFleet(model, bal, null as any)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet')
        t.is(payload.libBit.val, 3)

        for (const item of payload.libBit.lst) {
            t.regex(
                item,
                /^\[[a-zA-Z0-9_\-\.\/]+\]$/,
                `Path must be enclosed in square brackets: ${item}`,
            )
        }

        t.deepEqual(payload.libBit.lst, [
            '[alpha-org/000.alpha-bot/apps/995.library]',
            '[middle-org/100.middle-bot/apps/995.library]',
            '[zeta-org/999.zeta-bot/apps/995.library]',
        ])
    },
)

test.serial(
    'scanFleet -- handles headless execution safely without throwing on null ste',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_headless',
        )
        const repoA = path.join(mockFleetRoot, 'org-a', '000.repo')
        await fs.ensureDir(path.join(repoA, 'apps', '995.library'))
        await fs.writeFile(path.join(repoA, 'package.json'), '{}')

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any

        await scanFleet(model, bal, null as any)

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet')
        t.is(payload.libBit.val, 1)
    },
)

test.serial(
    'scanFleet -- streams pure 7-bit ASCII telemetry to cns00 when ste is present',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_telemetry_stream',
        )
        const repoA = path.join(mockFleetRoot, 'org-a', '000.repo')
        await fs.ensureDir(path.join(repoA, 'packages', '133.cloudflare'))
        await fs.writeFile(path.join(repoA, 'package.json'), '{}')

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const hunt = sinon.fake.resolves({})
        const ste = { hunt } as any
        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { src: '[133.cloudflare]', slv } as any

        await scanFleet(model, bal, ste)

        t.true(slv.calledOnce)
        t.true(hunt.called, 'ste.hunt must be called to update console')

        const loggedMessages: string[] = hunt.args.map(
            (call: any) => call[1]?.src,
        )
        t.true(
            loggedMessages.some((msg) =>
                msg.includes('>> [SCAN_FLEET] Scanning fleet root:'),
            ),
        )
        t.true(
            loggedMessages.some((msg) =>
                msg.includes(
                    '>> [SCAN_FLEET] Target pivot filter: 133.cloudflare',
                ),
            ),
        )
        t.true(
            loggedMessages.some((msg) =>
                msg.includes(
                    '>> [SCAN_FLEET_OK] Discovered 1 target(s) across fleet.',
                ),
            ),
        )

        for (const msg of loggedMessages) {
            t.regex(
                msg,
                /^[\x00-\x7F]*$/,
                `Telemetry message must be pure 7-bit ASCII: ${msg}`,
            )
        }
    },
)

test.serial(
    'scanFleet [NEG_CONTROL] -- fails closed with scan-fleet-error on unresolvable fleet root',
    async (t) => {
        cleanEnv()

        const hunt = sinon.fake.resolves({})
        const ste = { hunt } as any
        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any

        const originalCwd = process.cwd
        process.cwd = () => '/home/runner/work/unresolvable/unresolvable'

        try {
            await scanFleet(model, bal, ste)
        } finally {
            process.cwd = originalCwd
        }

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet-error')
        t.is(payload.libBit.src, 'NO_FLEET_ROOT')
        t.is(payload.libBit.val, -1)
        t.deepEqual(payload.libBit.lst, [])
    },
)

test.serial(
    'scanFleet [NEG_CONTROL] -- catches unexpected read errors and fulfills scan-fleet-error contract',
    async (t) => {
        const mockFleetRoot = path.resolve(
            process.cwd(),
            'scratch_test_fault_injection',
        )
        await fs.ensureDir(mockFleetRoot)

        t.teardown(async () => {
            await fs.remove(mockFleetRoot).catch(() => {})
        })

        process.env.FLEET_ROOT = mockFleetRoot

        const originalReaddirSync = fs.readdirSync
        fs.readdirSync = () => {
            throw new Error('EACCES: permission denied')
        }

        const slv = sinon.fake()
        const model = new LibraryModel()
        const bal = { slv } as any

        try {
            await scanFleet(model, bal, null as any)
        } finally {
            fs.readdirSync = originalReaddirSync
        }

        t.true(slv.calledOnce)
        const payload = slv.firstCall.args[0]
        t.is(payload.libBit.idx, 'scan-fleet-error')
        t.is(payload.libBit.val, -1)
        t.true(payload.libBit.src.includes('permission denied'))
        t.deepEqual(payload.libBit.lst, [])
    },
)

test.serial(
    'Pre-Flight Guard: resolveGitRoot finds active git anchor',
    async (t) => {
        const gitRoot = await resolveGitRoot(process.cwd())
        t.truthy(gitRoot)
        t.true(await fs.pathExists(path.join(gitRoot!, '.git')))
    },
)

test.serial(
    'Pre-Flight Guard: returns clean on unmolested target directory',
    async (t) => {
        const gitRoot = (await resolveGitRoot(process.cwd()))!
        const sandboxDir = path.join(gitRoot, 'test_clean_test')
        await fs.ensureDir(sandboxDir)

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const status = await checkGitWorkingTree(sandboxDir)
        t.true(status.clean)
        t.is(status.intersectingFiles.length, 0)
    },
)

test.serial(
    'Pre-Flight Guard: detects untracked file inside target directory',
    async (t) => {
        const gitRoot = (await resolveGitRoot(process.cwd()))!
        const targetDir = path.join(gitRoot, 'test_dirty_target_real')
        const untrackedFile = path.join(targetDir, 'probe.ts')

        await fs.ensureDir(targetDir)
        await fs.writeFile(untrackedFile, '// Probe data')

        t.teardown(async () => {
            await fs.remove(targetDir).catch(() => {})
        })

        const status = await checkGitWorkingTree(targetDir)
        t.false(status.clean)
        t.true(status.intersectingFiles.length > 0)
        t.true(
            status.intersectingFiles.some((f) =>
                f.includes('test_dirty_target_real'),
            ),
        )
    },
)

test.serial(
    'Pre-Flight Guard: ignores dirty files residing outside target directory',
    async (t) => {
        const gitRoot = (await resolveGitRoot(process.cwd()))!
        const isolatedTargetDir = path.join(gitRoot, 'test_isolated_target')
        const externalDirtyDir = path.join(gitRoot, 'test_external_dirty')
        const externalFile = path.join(externalDirtyDir, 'untracked.ts')

        await fs.ensureDir(isolatedTargetDir)
        await fs.ensureDir(externalDirtyDir)
        await fs.writeFile(externalFile, '// External file')

        t.teardown(async () => {
            await fs.remove(isolatedTargetDir).catch(() => {})
            await fs.remove(externalDirtyDir).catch(() => {})
        })

        const status = await checkGitWorkingTree(isolatedTargetDir)
        t.true(
            status.clean,
            'Target must remain clean despite sibling dirty files',
        )
        t.is(status.intersectingFiles.length, 0)
    },
)

test.serial(
    'progressLibrarySaga: aborts before staging when target tree is dirty',
    async (t) => {
        const gitRoot = (await resolveGitRoot(process.cwd()))!
        const dirtyTarget = path.join(gitRoot, 'test_saga_dirty_target_real')
        const dirtyFile = path.join(dirtyTarget, 'agent.ts')

        await fs.ensureDir(dirtyTarget)
        await fs.writeFile(dirtyFile, '// Important unsaved work')

        t.teardown(async () => {
            await fs.remove(dirtyTarget).catch(() => {})
        })

        let resolvedResult: any = null
        const bal = {
            src: dirtyTarget,
            slv: (res: any) => {
                resolvedResult = res
            },
        }

        await progressLibrarySaga(new LibraryModel(), bal as any, null as any)

        t.truthy(resolvedResult)
        t.is(resolvedResult.libBit.idx, 'progress-library-saga-error')
        t.true(
            resolvedResult.libBit.dat.targetsFailed[0].includes(
                'DIRTY_WORKING_TREE',
            ),
        )

        // Assert existing dirty work was strictly preserved and not overwritten
        const preservedContent = await fs.readFile(dirtyFile, 'utf8')
        t.is(preservedContent, '// Important unsaved work')
    },
)

test.serial(
    'Phase 1 Filter: rejects secrets, VCS folders, and build caches',
    (t) => {
        t.false(filterZeroTrust('/path/to/.env'))
        t.false(filterZeroTrust('/path/to/.env.local'))
        t.false(filterZeroTrust('/path/to/.env.production'))
        t.false(filterZeroTrust('/path/to/.dev.vars'))
        t.false(filterZeroTrust('/path/to/.git'))
        t.false(filterZeroTrust('/path/to/.github'))
        t.false(filterZeroTrust('/path/to/node_modules'))
        t.false(filterZeroTrust('/path/to/dist'))
        t.false(filterZeroTrust('/path/to/coverage'))
        t.false(filterZeroTrust('/path/to/.wrangler'))
        t.false(filterZeroTrust('/path/to/tsconfig.tsbuildinfo'))
        t.false(filterZeroTrust('/path/to/server.key'))
        t.false(filterZeroTrust('/path/to/cert.pem'))
        t.false(filterZeroTrust('/path/to/service-account-creds.json'))

        t.true(filterZeroTrust('/path/to/run.ts'))
        t.true(filterZeroTrust('/path/to/package.json'))
        t.true(filterZeroTrust('/path/to/00.library.unit/library.buzz.ts'))
    },
)

test.serial(
    'Phase 1 Staging: creates sibling staging folder on identical mount partition',
    async (t) => {
        const sandboxDir = path.resolve(process.cwd(), 'scratch_staging_test')
        const mockSource = path.join(sandboxDir, 'source_lib')
        const mockTarget = path.join(
            sandboxDir,
            'downstream',
            'apps',
            '995.library',
        )

        await fs.ensureDir(mockSource)
        await fs.ensureDir(path.dirname(mockTarget))
        await fs.writeFile(path.join(mockSource, 'index.ts'), '// clean code')

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const { stagingDir, parentDir } = await stageLibraryPayload(
            mockSource,
            mockTarget,
        )

        t.is(parentDir, path.dirname(mockTarget))
        t.true(stagingDir.startsWith(parentDir))
        t.true(await fs.pathExists(stagingDir))
        t.true(await fs.pathExists(path.join(stagingDir, 'index.ts')))

        await fs.remove(stagingDir)
    },
)

test.serial(
    'Phase 1 Staging: applies zero-trust filter and resolves symlinks',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_zero_trust_test',
        )
        const mockSource = path.join(sandboxDir, 'source_lib')
        const mockTarget = path.join(
            sandboxDir,
            'downstream',
            'apps',
            '995.library',
        )
        const externalSymlinkTarget = path.join(sandboxDir, 'external_file.txt')

        await fs.ensureDir(mockSource)
        await fs.ensureDir(path.dirname(mockTarget))

        // Valid files
        await fs.writeFile(
            path.join(mockSource, 'valid.ts'),
            'export const a = 1;',
        )
        await fs.writeFile(externalSymlinkTarget, 'external payload')
        await fs.symlink(
            externalSymlinkTarget,
            path.join(mockSource, 'symlink.txt'),
        )

        // Blacklisted items
        await fs.writeFile(path.join(mockSource, '.env'), 'SECRET=123')
        await fs.writeFile(
            path.join(mockSource, '.env.production'),
            'SECRET=456',
        )
        await fs.ensureDir(path.join(mockSource, 'node_modules'))
        await fs.writeFile(
            path.join(mockSource, 'node_modules', 'dummy.js'),
            'bad',
        )
        await fs.ensureDir(path.join(mockSource, '.git'))
        await fs.writeFile(path.join(mockSource, '.git', 'HEAD'), 'ref: main')
        await fs.writeFile(path.join(mockSource, 'bundle.tsbuildinfo'), 'cache')

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const { stagingDir } = await stageLibraryPayload(mockSource, mockTarget)

        // Assert valid files copied
        t.true(await fs.pathExists(path.join(stagingDir, 'valid.ts')))

        // Assert symlink dereferenced to physical file
        t.true(await fs.pathExists(path.join(stagingDir, 'symlink.txt')))
        const symlinkStat = await fs.lstat(path.join(stagingDir, 'symlink.txt'))
        t.false(
            symlinkStat.isSymbolicLink(),
            'Staged symlink must be dereferenced into a regular file',
        )
        t.is(
            await fs.readFile(path.join(stagingDir, 'symlink.txt'), 'utf8'),
            'external payload',
        )

        // Assert blacklisted files excluded
        t.false(await fs.pathExists(path.join(stagingDir, '.env')))
        t.false(await fs.pathExists(path.join(stagingDir, '.env.production')))
        t.false(await fs.pathExists(path.join(stagingDir, 'node_modules')))
        t.false(await fs.pathExists(path.join(stagingDir, '.git')))
        t.false(
            await fs.pathExists(path.join(stagingDir, 'bundle.tsbuildinfo')),
        )

        await fs.remove(stagingDir)
    },
)

test.serial(
    'Phase 1 Staging: cleans up partial staging directory on copy failure',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_staging_fail_test',
        )
        const mockTarget = path.join(
            sandboxDir,
            'downstream',
            'apps',
            '995.library',
        )
        const nonExistentSource = path.join(sandboxDir, 'ghost_source')

        await fs.ensureDir(path.dirname(mockTarget))

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        await t.throwsAsync(
            async () => {
                await stageLibraryPayload(nonExistentSource, mockTarget)
            },
            { message: /STAGING_FAILED/ },
        )

        const parentDir = path.dirname(mockTarget)
        const entries = await fs.readdir(parentDir)
        const orphanedStaging = entries.filter((e) =>
            e.startsWith('.tmp_staging_995_library_'),
        )

        t.is(
            orphanedStaging.length,
            0,
            'No orphaned staging folders should remain after a staging error',
        )
    },
)

test.serial(
    'Phase 2 Inode Swap: atomically shifts target to backup, promotes staging, and purges backup',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_swap_success_test',
        )
        const parentDir = path.join(sandboxDir, 'apps')
        const targetDir = path.join(parentDir, '995.library')
        const stagingDir = path.join(parentDir, '.tmp_staging_995_library_test')
        const backupDir = path.join(parentDir, '.tmp_backup_995_library_test')

        await fs.ensureDir(targetDir)
        await fs.ensureDir(stagingDir)

        // Initial files
        await fs.writeFile(
            path.join(targetDir, 'old_version.ts'),
            'export const v = 1;',
        )
        await fs.writeFile(
            path.join(stagingDir, 'new_version.ts'),
            'export const v = 2;',
        )

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const result = await swapAtomicInodes(stagingDir, targetDir, backupDir)

        t.true(result.promoted)
        t.false(result.restored)

        // Assert target contains new version
        t.true(await fs.pathExists(path.join(targetDir, 'new_version.ts')))
        t.false(await fs.pathExists(path.join(targetDir, 'old_version.ts')))

        // Assert staging and backup are purged
        t.false(await fs.pathExists(stagingDir))
        t.false(await fs.pathExists(backupDir))
    },
)

test.serial(
    'Phase 2 Inode Swap: creates target cleanly if destination does not exist prior to swap',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_swap_new_target_test',
        )
        const parentDir = path.join(sandboxDir, 'apps')
        const targetDir = path.join(parentDir, '995.library')
        const stagingDir = path.join(
            parentDir,
            '.tmp_staging_995_library_fresh',
        )
        const backupDir = path.join(parentDir, '.tmp_backup_995_library_fresh')

        await fs.ensureDir(stagingDir)
        await fs.writeFile(
            path.join(stagingDir, 'fresh.ts'),
            'export const fresh = true;',
        )

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        const result = await swapAtomicInodes(stagingDir, targetDir, backupDir)

        t.true(result.promoted)
        t.true(await fs.pathExists(path.join(targetDir, 'fresh.ts')))
        t.false(await fs.pathExists(stagingDir))
        t.false(await fs.pathExists(backupDir))
    },
)

test.serial(
    'Phase 2 Inode Swap: rollback restores original target if Step C rename throws',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_swap_rollback_test',
        )
        const parentDir = path.join(sandboxDir, 'apps')
        const targetDir = path.join(parentDir, '995.library')
        const nonExistentStaging = path.join(parentDir, '.tmp_ghost_staging')
        const backupDir = path.join(parentDir, '.tmp_backup_995_library_rb')

        await fs.ensureDir(targetDir)
        await fs.writeFile(
            path.join(targetDir, 'original.ts'),
            'export const pristine = true;',
        )

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        // swapAtomicInodes with ghost staging directory will fail on Step C
        const result = await swapAtomicInodes(
            nonExistentStaging,
            targetDir,
            backupDir,
        )

        t.false(result.promoted)
        t.true(
            result.restored,
            'Target must be restored from sibling backup upon Step C failure',
        )
        t.truthy(result.error)

        // Assert original target file restored cleanly
        t.true(await fs.pathExists(targetDir))
        t.true(await fs.pathExists(path.join(targetDir, 'original.ts')))
        t.is(
            await fs.readFile(path.join(targetDir, 'original.ts'), 'utf8'),
            'export const pristine = true;',
        )

        // Assert temporary folders unlinked
        t.false(await fs.pathExists(backupDir))
    },
)

test.serial(
    'retryAtomicRename: successfully renames and handles transient retries',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_rename_retry_test',
        )
        const srcFile = path.join(sandboxDir, 'source.txt')
        const destFile = path.join(sandboxDir, 'dest.txt')

        await fs.ensureDir(sandboxDir)
        await fs.writeFile(srcFile, 'hello')

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
        })

        await retryAtomicRename(srcFile, destFile, 3, 10)

        t.false(await fs.pathExists(srcFile))
        t.true(await fs.pathExists(destFile))
    },
)

test.serial(
    'Phase 3 Journal: writes and flushes active saga state to data/saga/active.json',
    async (t) => {
        const journalFile = getJournalPath()
        const mockJournal: SagaJournal = {
            sagaId: 'test-saga-001',
            sourceDir: '/source',
            status: 'RUNNING',
            targetsCompleted: ['/target1'],
            targetsFailed: [],
            backups: { '/target1': '/backup1' },
            records: {
                '/target1': { targetDir: '/target1', state: 'COMPLETED' },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        t.teardown(async () => {
            await fs.remove(path.dirname(journalFile)).catch(() => {})
        })

        await writeSagaJournal(mockJournal)

        t.true(await fs.pathExists(journalFile))
        const loaded = await fs.readJson(journalFile)
        t.is(loaded.sagaId, 'test-saga-001')
        t.is(loaded.status, 'RUNNING')
    },
)

test.serial(
    'Phase 3 Compensation: reverses multi-target fleet mutations in reverse chronological order',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_compensation_fleet_test',
        )
        const parentA = path.join(sandboxDir, 'repoA', 'apps')
        const parentB = path.join(sandboxDir, 'repoB', 'apps')
        const targetA = path.join(parentA, '995.library')
        const targetB = path.join(parentB, '995.library')
        const backupA = path.join(parentA, '.tmp_backup_A')
        const backupB = path.join(parentB, '.tmp_backup_B')

        await fs.ensureDir(targetA)
        await fs.ensureDir(targetB)
        await fs.ensureDir(parentA)
        await fs.ensureDir(parentB)
        await fs.ensureDir(backupA)
        await fs.ensureDir(backupB)

        // Initial files
        await fs.writeFile(path.join(backupA, 'version.txt'), 'ORIGINAL_A')
        await fs.writeFile(path.join(targetA, 'version.txt'), 'MUTATED_A')

        await fs.writeFile(path.join(backupB, 'version.txt'), 'ORIGINAL_B')
        await fs.writeFile(path.join(targetB, 'version.txt'), 'MUTATED_B')

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
            await fs.remove(path.dirname(getJournalPath())).catch(() => {})
        })

        const mockJournal: SagaJournal = {
            sagaId: 'test-fleet-rollback',
            sourceDir: '/source',
            status: 'RUNNING',
            targetsCompleted: [targetA, targetB],
            targetsFailed: ['/targetC'],
            backups: {
                [targetA]: backupA,
                [targetB]: backupB,
            },
            records: {
                [targetA]: { targetDir: targetA, state: 'COMPLETED' },
                [targetB]: { targetDir: targetB, state: 'COMPLETED' },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        const outcome = await rollbackSagaJournal(mockJournal)

        t.true(outcome.compensated)
        t.is(outcome.unrecoverableErrors.length, 0)

        // Assert both targets reverted to pristine backup state
        t.is(
            await fs.readFile(path.join(targetA, 'version.txt'), 'utf8'),
            'ORIGINAL_A',
        )
        t.is(
            await fs.readFile(path.join(targetB, 'version.txt'), 'utf8'),
            'ORIGINAL_B',
        )

        // Assert backups consumed and unlinked
        t.false(await fs.pathExists(backupA))
        t.false(await fs.pathExists(backupB))

        // Assert journal recorded COMPENSATED status
        t.is(mockJournal.status, 'COMPENSATED')
    },
)

test.serial(
    'Phase 3 Finalize: sweeps lingering backups and unlinks active journal file on success',
    async (t) => {
        const sandboxDir = path.resolve(process.cwd(), 'scratch_finalize_test')
        const backupDir = path.join(sandboxDir, '.tmp_backup_clean')
        const journalFile = getJournalPath()

        await fs.ensureDir(backupDir)
        await fs.writeFile(path.join(backupDir, 'dummy.txt'), 'old')

        t.teardown(async () => {
            await fs.remove(sandboxDir).catch(() => {})
            await fs.remove(path.dirname(journalFile)).catch(() => {})
        })

        const mockJournal: SagaJournal = {
            sagaId: 'test-finalize',
            sourceDir: '/source',
            status: 'RUNNING',
            targetsCompleted: ['/target'],
            targetsFailed: [],
            backups: { '/target': backupDir },
            records: {
                '/target': { targetDir: '/target', state: 'COMPLETED' },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        await finalizeSagaJournal(mockJournal)

        t.false(await fs.pathExists(backupDir))
        t.false(await fs.pathExists(journalFile))
    },
)

test.serial(
    'auditLibrary -- parses manifest and validates aligned repositories',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_test_audit_aligned',
        )
        await fs.ensureDir(sandboxDir)
        process.env.FLEET_ROOT = sandboxDir

        const repoADir = path.join(sandboxDir, 'repoA')
        await fs.ensureDir(path.join(repoADir, 'apps/995.library'))
        await fs.writeJson(
            path.join(repoADir, 'apps/995.library/package.json'),
            {
                name: '@test/repoA',
                version: '1.0.12',
            },
        )

        const manifestFile = path.join(sandboxDir, 'versions.json')
        await fs.writeJson(manifestFile, {
            schema_version: 1,
            library_version: '1.0.12',
            updated_at: new Date().toISOString(),
            sovereign_repo: 'camp-candor/995.library',
            allow_periphery_broadcast: false,
            repositories: {
                repoA: {
                    path: repoADir,
                    pinned_sha: '7bd4e10a8b9c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
                    required_contract_version: '1.0.12',
                    expected_branch: 'main',
                    status: 'LOCKED',
                },
            },
        })

        t.teardown(async () => {
            delete process.env.FLEET_ROOT
            await fs.remove(sandboxDir).catch(() => {})
        })

        const slv = sinon.fake()
        const bal = { src: manifestFile, slv } as any

        await auditLibrary(new LibraryModel(), bal, null as any)

        t.true(slv.calledOnce, 'Resolver must be executed')
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'audit-library')
        t.is(res.libBit.val, 0, 'Zero drift expected')

        const report = res.libBit.dat
        t.is(report.records.length, 1)
        t.is(report.records[0].repo, 'repoA')
        t.is(report.records[0].status, 'ALIGNED')
    },
)

test.serial(
    'auditLibrary -- detects DRIFT_VERSION, DRIFT_BRANCH, and MISSING repos',
    async (t) => {
        const sandboxDir = path.resolve(
            process.cwd(),
            'scratch_test_audit_drift',
        )
        await fs.ensureDir(sandboxDir)
        process.env.FLEET_ROOT = sandboxDir

        // Stale Repo
        const staleDir = path.join(sandboxDir, 'staleRepo')
        await fs.ensureDir(path.join(staleDir, 'apps/995.library'))
        await fs.writeJson(
            path.join(staleDir, 'apps/995.library/package.json'),
            {
                version: '1.0.10',
            },
        )

        const manifestFile = path.join(sandboxDir, 'versions.json')
        await fs.writeJson(manifestFile, {
            schema_version: 1,
            library_version: '1.0.12',
            updated_at: new Date().toISOString(),
            sovereign_repo: 'camp-candor/995.library',
            repositories: {
                staleRepo: {
                    path: staleDir,
                    required_contract_version: '1.0.12',
                    expected_branch: 'main',
                },
                missingRepo: {
                    path: path.join(sandboxDir, 'nonexistent_repo'),
                    required_contract_version: '1.0.12',
                    expected_branch: 'main',
                },
            },
        })

        t.teardown(async () => {
            delete process.env.FLEET_ROOT
            await fs.remove(sandboxDir).catch(() => {})
        })

        const slv = sinon.fake()
        const bal = { src: manifestFile, slv } as any

        await auditLibrary(new LibraryModel(), bal, null as any)

        t.true(slv.calledOnce)
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'audit-library')
        t.is(res.libBit.val, 2, 'Two drifted repositories expected')

        const report = res.libBit.dat
        const staleRecord = report.records.find(
            (r: any) => r.repo === 'staleRepo',
        )
        const missingRecord = report.records.find(
            (r: any) => r.repo === 'missingRepo',
        )

        t.is(staleRecord.status, 'DRIFT_VERSION')
        t.is(missingRecord.status, 'MISSING')
    },
)

test.serial(
    'auditLibrary -- fails closed cleanly on missing or corrupt manifest',
    async (t) => {
        const slv = sinon.fake()
        const bal = { src: '/path/to/missing/versions.json', slv } as any

        await auditLibrary(new LibraryModel(), bal, null as any)

        t.true(slv.calledOnce)
        const res = slv.firstCall.args[0]
        t.is(res.libBit.idx, 'audit-library-error')
        t.is(res.libBit.val, 0)
        t.is(res.libBit.dat, null)
    },
)
