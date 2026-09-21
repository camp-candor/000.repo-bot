import { describe, it, expect, vi } from 'vitest';

// Mock dynamicWorker completely to avoid Vitest loading issues with undici/ajv
vi.mock('@funtuantw/pi-agent-cf', () => ({
  createAgentWorker: () => ({
    handler: {
      fetch: vi.fn(),
    },
    AgentSessionDO: class {},
  }),
}));

import app from '../../src/index.js';

describe('repo-bot edge worker initialization', () => {
  it('responds with status message on GET /', async () => {
    const res = await app.request('http://localhost/');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('REPO-BOT EDGE CONTROL PLANE IS LIVE');
  });

  it('reports health and gateway status on GET /health', async () => {
    const mockEnv = {
      GITHUB_TOKEN: 'mock_token',
      CLOUDFLARE_ACCOUNT_ID: 'mock_acc',
      CLOUDFLARE_API_TOKEN: 'mock_api',
      CLOUDFLARE_AI_GATEWAY: 'test-gateway',
      AI: {},
    };
    const res = await app.request('http://localhost/health', {}, mockEnv as any);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.hasGithubToken).toBe(true);
    expect(json.aiGateway).toBe('test-gateway');
  });
});
