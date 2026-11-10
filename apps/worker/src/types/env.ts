import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'
import type { DiffBoundaryEvaluationResult } from '../audit/diffBoundarySentinel.js'

export interface Env {
  readonly GITHUB_WEBHOOK_SECRET?: string
  readonly GITHUB_TOKEN?: string
  readonly AI?: any
  readonly DB?: D1Database
  readonly AGENT_SESSION?: DurableObjectNamespace
  readonly REPO_BOT_DO?: DurableObjectNamespace
  readonly LAST_BOUNDARY_AUDIT?: DiffBoundaryEvaluationResult
}
