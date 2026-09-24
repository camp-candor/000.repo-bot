import clone from 'clone-deep'
import * as Act from './github.action.js'
import { GithubModel } from './github.model.js'
import * as Buzz from './github.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: GithubModel = new GithubModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_GITHUB:
            return Buzz.updateGithub(clone(model), act.bale, state)

        case Act.INIT_GITHUB:
            return Buzz.initGithub(clone(model), act.bale, state)

        case Act.FETCH_MERGE_CANDIDATES:
            return Buzz.fetchMergeCandidates(clone(model), act.bale, state)

        case Act.INSPECT_PR_CAS:
            return Buzz.inspectPrCas(clone(model), act.bale, state)

        case Act.EXECUTE_MERGE:
            return Buzz.executeMerge(clone(model), act.bale, state)

        case Act.TRIGGER_TASK_ROLLBACK:
            return Buzz.triggerTaskRollback(clone(model), act.bale, state)

        case Act.FETCH_RECENT_COMMITS:
            return Buzz.fetchRecentCommits(clone(model), act.bale, state)

        case Act.PREVIEW_COMMIT_DETAILS:
            return Buzz.previewCommitDetails(clone(model), act.bale, state)

        case Act.EXECUTE_HARD_RESET:
            return Buzz.executeHardReset(clone(model), act.bale, state)

        case Act.REGISTER_WATCHED_REPO:
            return Buzz.registerWatchedRepo(clone(model), act.bale, state)

        case Act.LIST_WATCHED_REPOS:
            return Buzz.listWatchedRepos(clone(model), act.bale, state)

        case Act.AUDIT_GITHUB_TOKEN:
            return Buzz.auditGithubToken(clone(model), act.bale, state)

        case Act.CHECK_SLACK_BRIDGE_STATUS:
            return Buzz.checkSlackBridgeStatus(clone(model), act.bale, state)

        case Act.LIST_GITHUB:
            return Buzz.listGithub(clone(model), act.bale, state)

        case Act.AUDIT_HASH_CHAIN_INTEGRITY:
            return Buzz.auditHashChainIntegrity(clone(model), act.bale, state)

        case Act.INSPECT_D1_AUDIT_LOG:
            return Buzz.inspectD1AuditLog(clone(model), act.bale, state)

        case Act.TRIGGER_COLD_DRAINAGE:
            return Buzz.triggerColdDrainage(clone(model), act.bale, state)

        default:
            return model
    }
}
