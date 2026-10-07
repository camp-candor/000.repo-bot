import type {
    AuditCycleRecord,
    TrajectoryMode,
} from '../triage/circuitBreaker.js'

export interface StoryArchitectDossier {
    dossierId: string
    taskId: string
    candidateSha: string
    status: 'BLOCKED'
    exhaustedAttempts: number
    escalationTrigger: 'MAX_ATTEMPTS_EXHAUSTED' | 'STRUCTURAL_DIVERGENCE'
    trajectory: TrajectoryMode
    timeline: string[]
    contradictionLog: string
    ledgerHashSnapshot: string
    clickUpPayload: {
        taskName: string
        priority: 'URGENT' | 'HIGH'
        tags: string[]
        markdownDescription: string
    }
    generatedAtIso: string
}

/**
 * Builds an immutable escalation dossier for human Story Architect triage.
 */
export function buildStoryArchitectDossier(
    taskId: string,
    candidateSha: string,
    history: AuditCycleRecord[],
    trajectory: TrajectoryMode,
    ledgerHeadHash: string,
): StoryArchitectDossier {
    const exhaustedAttempts = history.length
    const isDivergent = trajectory === 'DIVERGENCE'
    const escalationTrigger = isDivergent
        ? 'STRUCTURAL_DIVERGENCE'
        : 'MAX_ATTEMPTS_EXHAUSTED'

    const timeline = history.map((record) => {
        const tokens =
            record.errorTokens.length > 0
                ? record.errorTokens.join(', ')
                : 'none'
        return `[Cycle ${record.attempt}]${record.classification} :: Tokens: [${tokens}] (${new Date(record.timestampMs).toISOString()})`
    })

    let contradictionLog = ''
    if (isDivergent) {
        contradictionLog = `Structural divergence detected: Generation oscillated across conflicting taxonomy categories: ${history.map((h) => h.classification).join(' -> ')}. Automated retry halted to preserve compute.`
    } else {
        contradictionLog = `Attempt budget exhausted across ${exhaustedAttempts} cycles without convergence. Last classification: ${history[history.length - 1]?.classification || 'UNKNOWN'}.`
    }

    const taskName = `[P0 DRIFT ESCALATION] ${taskId} - Structural Remediation Required`
    const priority = isDivergent ? 'URGENT' : 'HIGH'
    const tags = [
        'drift-gauntlet',
        'story-architect-triage',
        isDivergent ? 'divergence-conflict' : 'budget-exhausted',
    ]

    const markdownDescription = [
        '# Story Architect Escalation Dossier',
        `**Task ID:** ${taskId}`,
        `**Candidate Plate SHA:** \`${candidateSha}\``,
        `**Escalation Trigger:** ${escalationTrigger}`,
        `**Trajectory:** ${trajectory}`,
        `**Exhausted Attempts:** ${exhaustedAttempts}`,
        `**Ledger State Digest:** \`${ledgerHeadHash}\``,
        '',
        '## Contradiction Analysis',
        `> ${contradictionLog}`,
        '',
        '## Cycle Audit Timeline',
        timeline.map((line) => `- ${line}`).join('\n'),
        '',
        '## Operator Action Required',
        '1. Inspect candidate plate render in staging scratch storage.',
        '2. Review prompt seed basin and evaluate character model sheet constraints.',
        '3. Provide manual prompt override or approve modified canon anchor via ChatOps `/repo-bot override`.',
    ].join('\n')

    return {
        dossierId: `dossier-${taskId}-${Date.now()}`,
        taskId,
        candidateSha,
        status: 'BLOCKED',
        exhaustedAttempts,
        escalationTrigger,
        trajectory,
        timeline,
        contradictionLog,
        ledgerHashSnapshot: ledgerHeadHash,
        clickUpPayload: {
            taskName,
            priority,
            tags,
            markdownDescription,
        },
        generatedAtIso: new Date().toISOString(),
    }
}

/**
 * Formats the dossier into standardized 7-bit ASCII text for ChatOps webhooks.
 */
export function formatDossierForChatOps(
    dossier: StoryArchitectDossier,
): string {
    return [
        '```text',
        '================================================================================',
        '>> [ESCALATION:TIER_3] STORY ARCHITECT INTERVENTION REQUIRED',
        '================================================================================',
        `TASK ID:        ${dossier.taskId}`,
        `DOSSIER ID:     ${dossier.dossierId}`,
        `TRIGGER:        ${dossier.escalationTrigger}`,
        `TRAJECTORY:     ${dossier.trajectory}`,
        `CYCLES TRIED:   ${dossier.exhaustedAttempts}`,
        `CANDIDATE SHA:  ${dossier.candidateSha}`,
        `LEDGER HEAD:    ${dossier.ledgerHashSnapshot.substring(0, 16)}...`,
        '--------------------------------------------------------------------------------',
        'TIMELINE:',
        dossier.timeline.map((t) => `  * ${t}`).join('\n'),
        '--------------------------------------------------------------------------------',
        `CONTRADICTION:  ${dossier.contradictionLog}`,
        'STATUS:         EXECUTION FROZEN :: TASK QUARANTINED TO DLQ [HALT]',
        '================================================================================',
        '```',
    ].join('\n')
}
