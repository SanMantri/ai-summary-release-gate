import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDashboardServer, type DashboardServerOptions } from './create-dashboard-server';
import { createServerLogger } from './request-logging';
import { FakeSummaryProvider } from './summary-provider/fake-summary-provider';
import { TicketStore } from './ticket-store';

const runningServers: Array<{ close: () => Promise<void> }> = [];

async function startDashboardServer(
  overrides: Partial<DashboardServerOptions> = {},
): Promise<string> {
  const app = createDashboardServer({
    ticketStore: new TicketStore(),
    summaryProvider: new FakeSummaryProvider(),
    providerTimeoutMs: 1_000,
    logger: createServerLogger({}),
    ...overrides,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  runningServers.push({
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const seedRequest = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ messages: [{ author: 'customer', body: 'I was charged twice.' }] }),
};

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
});

describe('DEV-03 createDashboardServer test-seeding guard', () => {
  it('does not expose the test-seeding endpoint unless test seeding is enabled', async () => {
    const baseUrl = await startDashboardServer();

    const response = await fetch(`${baseUrl}/api/__test__/tickets`, seedRequest);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});
