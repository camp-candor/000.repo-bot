export interface WatchedRepo {
  id: string // e.g. "camp-candor/000.repo-bot"
  owner: string
  repo: string
  url: string
}

export interface ParsedAskJulesInput {
  rawPath: string
  prompt: string
}

/**
 * Parses raw text input split by the first colon into path and task prompt.
 */
export function parseAskJulesMessage(text: string): ParsedAskJulesInput | null {
  if (!text) return null

  // Find the first colon that isn't part of a Windows drive letter
  let colonIndex = -1;
  const match = text.match(/(?:^|[^a-zA-Z])([a-zA-Z]:\\\\|[a-zA-Z]:\/)/);
  if (match) {
    // There is a drive letter, find the next colon
    const firstColon = text.indexOf(':');
    colonIndex = text.indexOf(':', firstColon + 1);
  } else {
    colonIndex = text.indexOf(':');
  }

  // If there's a space-colon-space, prefer that
  const explicitColon = text.indexOf(' : ');
  if (explicitColon !== -1) {
    colonIndex = explicitColon + 1;
  }

  if (colonIndex === -1) return null

  const rawPath = text.substring(0, colonIndex).trim()
  const prompt = text.substring(colonIndex + 1).trim()

  if (!rawPath || !prompt) return null
  return { rawPath, prompt }
}

/**
 * Resolves polymorphic shell prompts, filesystem paths, and URLs against watched fleet repos.
 */
export function resolveFleetRepo(
  rawInput: string,
  fleet: WatchedRepo[],
): WatchedRepo | null {
  if (!rawInput || fleet.length === 0) return null

  // 1. Strip PowerShell tokens, brackets, quotes, and prompt symbols
  let cleaned = rawInput
    .trim()
    .replace(/^PS\s+/i, '')
    .replace(/[>"'`]/g, '')
    .trim()

  // 2. Normalize Windows backslashes to forward slashes
  cleaned = cleaned.replace(/\\+/g, '/')

  // 3. Strip trailing subpaths common in monorepo workspaces
  cleaned = cleaned
    .replace(/\/apps(\/.*)?$/i, '')
    .replace(/\/packages(\/.*)?$/i, '')
    .replace(/\/src(\/.*)?$/i, '')
    .replace(/\/dist(\/.*)?$/i, '')
    .replace(/\/+$/, '')

  const lowerCleaned = cleaned.toLowerCase()

  // 4. Exact match against repository ID, URL, or URL suffix
  for (const item of fleet) {
    const itemId = item.id.toLowerCase()
    const itemUrl = item.url.toLowerCase()

    if (
      lowerCleaned === itemId ||
      lowerCleaned === itemUrl ||
      lowerCleaned.endsWith(`/${itemId}`) ||
      lowerCleaned.endsWith(itemId)
    ) {
      return item
    }
  }

  // 5. Segment match against individual repo name
  for (const item of fleet) {
    const repoName = item.repo.toLowerCase()
    const segments = lowerCleaned.split('/')
    if (segments.includes(repoName)) {
      return item
    }
  }

  return null
}
