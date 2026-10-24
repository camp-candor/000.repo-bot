import fs from 'fs'
import path from 'path'

export interface RepoIdentity {
    name: string
    label: string
    version: string
    titleBanner: string
}

let cachedIdentity: RepoIdentity | null = null

/**
 * Ascends from startDir to discover the monorepo root package.json.
 */
export function resolveRootPackageJson(startDir: string = process.cwd()): {
    pkg: Record<string, any>
    rootDir: string
} {
    let curr = path.resolve(startDir)
    while (curr && curr !== path.dirname(curr)) {
        const candidate = path.join(curr, 'package.json')
        if (fs.existsSync(candidate)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'))
                const parentName = path.basename(path.dirname(curr))
                const isWorkspaceSubpackage =
                    parentName === 'packages' || parentName === 'apps'

                // Identify root: contains workspaces, has .git, or is a standalone project
                if (
                    pkg.workspaces ||
                    fs.existsSync(path.join(curr, '.git')) ||
                    !isWorkspaceSubpackage
                ) {
                    return { pkg, rootDir: curr }
                }
            } catch {
                // Ignore parse errors on intermediate files
            }
        }
        curr = path.dirname(curr)
    }

    return {
        pkg: { name: 'repo-bot', version: '0.1.0' },
        rootDir: process.cwd(),
    }
}

/**
 * Returns dynamic repository identity formatted for Blessed TUI headers and CLI telemetry.
 */
export function getRepoIdentity(startDir?: string): RepoIdentity {
    if (cachedIdentity && !startDir) {
        return cachedIdentity
    }

    const { pkg, rootDir } = resolveRootPackageJson(startDir)

    const rawName =
        pkg.name || pkg.label || path.basename(rootDir) || 'repo-bot'

    // Strip scope (@camp_candor/repo-bot -> repo-bot)
    const name = String(rawName)
        .replace(/^@[^/]+\//, '')
        .trim()
    const label = name.toUpperCase()
    const rawVersion = pkg.version
        ? String(pkg.version).replace(/^v/, '')
        : '0.1.0'
    const version = `v${rawVersion}`

    // Formatted banner: "repo-bot v0.1.1" or "REPO-BOT V0.1.1"
    const titleBanner = `${name} ${version}`

    const identity: RepoIdentity = {
        name,
        label,
        version,
        titleBanner,
    }

    if (!startDir) {
        cachedIdentity = identity
    }

    return identity
}
