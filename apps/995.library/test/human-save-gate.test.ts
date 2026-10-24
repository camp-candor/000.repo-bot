import test from 'ava';
import sinon from 'sinon';
import path from 'path';
import fs from 'fs-extra';
import { LibraryModel } from '../995.library/00.library.unit/library.model';
import {
    generateConflictScratchpad,
    sanitizeAndValidateScratchpad,
    openHumanSaveGate,
} from '../995.library/00.library.unit/buz/human-save-gate.buzz';

test('generateConflictScratchpad -- injects conflict delimiters for designated repo nodes', (t) => {
    const rawJson = JSON.stringify(
        {
            repositories: {
                repoA: { pinned_sha: '1111111111111111111111111111111111111111' },
            },
        },
        null,
        2
    );

    const conflicts = [
        {
            repo: 'repoA',
            localSha: '1111111111111111111111111111111111111111',
            remoteSha: '2222222222222222222222222222222222222222',
        },
    ];

    const annotated = generateConflictScratchpad(rawJson, conflicts);
    t.true(annotated.includes('<<<<<<< LOCAL WORKSPACE PIN (repoA)'));
    t.true(annotated.includes('======='));
    t.true(annotated.includes('>>>>>>> REMOTE SOVEREIGN PIN (repoA)'));
    t.true(annotated.includes('2222222222222222222222222222222222222222'));
});

test('sanitizeAndValidateScratchpad -- catches unremoved conflict markers', (t) => {
    const dirty = '{\n  "repositories": {\n<<<<<<< LOCAL\n  "repoA": {}\n=======\n  "repoA": {}\n>>>>>>> REMOTE\n  }\n}';
    const res = sanitizeAndValidateScratchpad(dirty);
    t.false(res.valid);
    t.is(res.error, 'Unresolved git conflict markers remain in document');
});

test('sanitizeAndValidateScratchpad -- validates SHA format and passes valid json', (t) => {
    const invalidSha = JSON.stringify({
        repositories: { repoA: { pinned_sha: 'invalid-sha-123' } },
    });
    const res1 = sanitizeAndValidateScratchpad(invalidSha);
    t.false(res1.valid);
    t.true(res1.error?.includes('Invalid 40-character hex commit SHA'));

    const validJson = JSON.stringify({
        repositories: { repoA: { pinned_sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e' } },
    });
    const res2 = sanitizeAndValidateScratchpad(validJson);
    t.true(res2.valid);
    t.truthy(res2.cleanedJson);
});

test.serial('openHumanSaveGate -- trips circuit breaker after 3 failed attempts in headless mode', async (t) => {
    const sandboxDir = path.resolve(process.cwd(), 'scratch_test_human_gate_tripped');
    await fs.ensureDir(sandboxDir);

    const canonicalPath = path.join(sandboxDir, 'versions.json');
    const originalContent = JSON.stringify(
        {
            repositories: {
                repoA: { pinned_sha: '1111111111111111111111111111111111111111' },
            },
        },
        null,
        2
    );
    await fs.writeFile(canonicalPath, originalContent);

    t.teardown(async () => {
        await fs.remove(sandboxDir).catch(() => {});
        await fs.remove(path.resolve(process.cwd(), 'data/lockfile')).catch(() => {});
    });

    const slv = sinon.fake();
    const bal = {
        src: canonicalPath,
        dat: {
            conflicts: [
                {
                    repo: 'repoA',
                    localSha: '1111111111111111111111111111111111111111',
                    remoteSha: '2222222222222222222222222222222222222222',
                },
            ],
        },
        slv,
    } as any;

    const ste = { hunt: sinon.fake.resolves({}) } as any;

    await openHumanSaveGate(new LibraryModel(), bal, ste);

    t.true(slv.calledOnce);
    const res = slv.firstCall.args[0];
    t.is(res.libBit.idx, 'human-save-gate-tripped');
    t.is(res.libBit.val, 3);
    t.true(res.libBit.dat.tripped);

    // Assert canonical file preserved intact
    const preserved = await fs.readFile(canonicalPath, 'utf8');
    t.is(preserved, originalContent);
});
