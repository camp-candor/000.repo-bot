import test from 'ava';
import path from 'path';
import fs from 'fs';
import type { VersionsManifest } from '../995.library/00.library.unit/fce/versions.interface';

const candidatePaths = [
  path.resolve(process.cwd(), 'apps/995.library/data/versions.json'),
  path.resolve(process.cwd(), 'data/versions.json'),
  path.resolve(__dirname, '../data/versions.json'),
];
const manifestPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];


test('versions.json -- file exists and is valid JSON', (t) => {
  t.true(fs.existsSync(manifestPath), `Manifest must exist at ${manifestPath}`);
  const raw = fs.readFileSync(manifestPath, 'utf8');
  t.notThrows(() => JSON.parse(raw), 'Manifest must be syntactically valid JSON');
});

test('versions.json -- top-level schema invariants', (t) => {
  const manifest: VersionsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  t.is(typeof manifest.schema_version, 'number', 'schema_version must be an integer');
  t.true(manifest.schema_version >= 1, 'schema_version must be >= 1');

  t.regex(manifest.library_version, /^[0-9]+\.[0-9]+\.[0-9]+$/, 'library_version must be exact SemVer');
  t.false(manifest.library_version.includes('^'), 'library_version cannot contain ^');
  t.false(manifest.library_version.includes('~'), 'library_version cannot contain ~');

  t.is(manifest.sovereign_repo, 'camp-candor/995.library', 'sovereign_repo must designate canonical master');
  t.is(manifest.allow_periphery_broadcast, false, 'allow_periphery_broadcast must be false');
  t.notThrows(() => new Date(manifest.updated_at).toISOString(), 'updated_at must be valid ISO-8601');
});

test('versions.json -- shared_pivots exact versioning', (t) => {
  const manifest: VersionsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  t.is(typeof manifest.shared_pivots, 'object', 'shared_pivots must be a record');

  for (const [pivot, version] of Object.entries(manifest.shared_pivots)) {
    t.regex(version, /^[0-9]+\.[0-9]+\.[0-9]+$/, `Pivot ${pivot} version must be exact SemVer`);
    t.false(version.includes('^'), `Pivot ${pivot} version cannot contain ^`);
    t.false(version.includes('~'), `Pivot ${pivot} version cannot contain ~`);
  }
});

test('versions.json -- repository matrix integrity and 40-char SHA invariant', (t) => {
  const manifest: VersionsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  t.is(typeof manifest.repositories, 'object', 'repositories must be a record');

  const repos = Object.entries(manifest.repositories);
  t.true(repos.length > 0, 'repositories must contain registered entries');

  for (const [repoName, config] of repos) {
    t.truthy(config.path, `Repo ${repoName} must specify path`);
    t.regex(config.pinned_sha, /^[0-9a-f]{40}$/i, `Repo ${repoName} pinned_sha must be exactly 40-character hex SHA`);
    t.regex(config.required_contract_version, /^[0-9]+\.[0-9]+\.[0-9]+$/, `Repo ${repoName} required_contract_version must be exact SemVer`);
    t.truthy(config.expected_branch, `Repo ${repoName} must declare expected_branch`);
    t.true(['LOCKED', 'UNMANAGED', 'STAGED'].includes(config.status), `Repo ${repoName} has invalid status: ${config.status}`);
  }
});
