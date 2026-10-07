export interface GitTreeEntry {
    path: string
    mode: '100644' | '100755' | '040000' | '160000' | '120000'
    type: 'blob' | 'tree' | 'commit'
    sha: string
}

export interface GitCommitClientConfig {
    token: string
    baseUrl?: string
}

export class GitCommitClient {
    private baseUrl: string

    constructor(private config: GitCommitClientConfig) {
        this.baseUrl = (config.baseUrl || 'https://api.github.com').replace(
            /\/+$/,
            '',
        )
    }

    private async request<T>(
        path: string,
        options: RequestInit = {},
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`
        const headers = new Headers(options.headers || {})
        headers.set('Authorization', `Bearer ${this.config.token}`)
        headers.set('Accept', 'application/vnd.github+json')
        headers.set('User-Agent', '000.repo-bot-drainage')

        const response = await fetch(url, { ...options, headers })
        if (!response.ok) {
            const errBody = await response
                .text()
                .catch(() => 'No response body')
            throw new Error(
                `GITHUB_API_ERROR: HTTP ${response.status} on ${path}: ${errBody}`,
            )
        }

        return (await response.json()) as T
    }

    public async getRef(
        owner: string,
        repo: string,
        ref: string,
    ): Promise<string> {
        const cleanRef = ref.replace(/^refs\//, '')
        const data = await this.request<{ object: { sha: string } }>(
            `/repos/${owner}/${repo}/git/refs/${cleanRef}`,
        )
        return data.object.sha
    }

    public async createBlob(
        owner: string,
        repo: string,
        content: string,
    ): Promise<string> {
        const data = await this.request<{ sha: string }>(
            `/repos/${owner}/${repo}/git/blobs`,
            {
                method: 'POST',
                body: JSON.stringify({
                    content,
                    encoding: 'utf-8',
                }),
            },
        )
        return data.sha
    }

    public async createTree(
        owner: string,
        repo: string,
        baseTreeSha: string | null,
        tree: GitTreeEntry[],
    ): Promise<string> {
        const payload: Record<string, any> = { tree }
        if (baseTreeSha) {
            payload.base_tree = baseTreeSha
        }

        const data = await this.request<{ sha: string }>(
            `/repos/${owner}/${repo}/git/trees`,
            {
                method: 'POST',
                body: JSON.stringify(payload),
            },
        )
        return data.sha
    }

    public async createCommit(
        owner: string,
        repo: string,
        message: string,
        treeSha: string,
        parentCommitShas: string[],
    ): Promise<string> {
        const data = await this.request<{ sha: string }>(
            `/repos/${owner}/${repo}/git/commits`,
            {
                method: 'POST',
                body: JSON.stringify({
                    message,
                    tree: treeSha,
                    parents: parentCommitShas,
                }),
            },
        )
        return data.sha
    }

    public async updateRef(
        owner: string,
        repo: string,
        ref: string,
        commitSha: string,
        force = false,
    ): Promise<string> {
        const cleanRef = ref.replace(/^refs\//, '')
        const data = await this.request<{ object: { sha: string } }>(
            `/repos/${owner}/${repo}/git/refs/${cleanRef}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    sha: commitSha,
                    force,
                }),
            },
        )
        return data.object.sha
    }
}
