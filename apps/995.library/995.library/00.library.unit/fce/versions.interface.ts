export interface PinnedRepoConfig {
  cluster?: string;
  path: string;
  pinned_sha: string;
  required_contract_version: string;
  expected_branch: string;
  status: 'LOCKED' | 'UNMANAGED' | 'STAGED';
  dormant_by_design?: boolean;
  boundary_dependencies?: string[];
}

export interface VersionsManifest {
  $schema?: string;
  schema_version: number;
  library_version: string;
  updated_at: string;
  sovereign_repo: string;
  allow_periphery_broadcast: boolean;
  shared_pivots: Record<string, string>;
  repositories: Record<string, PinnedRepoConfig>;
}
