# Test strategy

This explains *why* the release gate is built the way it is. The spec, catalog and decision log are in [`plan.md`](../plan.md); how to run things is in the [README](../README.md).

## The risk being gated

An agent approves an AI-written summary and then acts on it. Three failures matter most, in this order:

1. **The wrong ticket's content gets approved.** A summary cites, and so may leak, another customer's messages.
2. **Facts are invented.** The summary cites the right message but states a refund amount, order number or date that isn't there.
3. **The feature lies about its state.** Approval is enabled after a failure, a stale answer appears on the wrong ticket, or a retry silently keeps an old result.

Everything below is arranged so these failures are caught at the cheapest layer that can catch them, and so that a red build explains itself.

## Layers, and where the line is drawn

| Layer | Question it answers | Why it lives here |
|---|---|---|
| Developer unit (Vitest) | Is the citation rule right for every input? | Pure logic: running every combination here takes milliseconds |
| API (Playwright, no browser) | Does the server enforce the rule, whatever the client sends? | A disabled button can be bypassed with a `POST`. The API is the actual control, so every invalid combination is tested there |
| UI (Playwright + Chromium, AI service faked in the browser) | Does the agent see the right state and only get the right actions? | Only a browser can show button state, timing, late responses and rendering. Combinations aren't repeated here |
| Smoke (nothing faked in the browser) | Does the real UI → API → AI service path work? | Browser-level fakes would hide a URL or payload mismatch between UI and API |
| Evaluation (no browser) | Do our quality checks classify model outputs the way a human would? | Model quality is a property of outputs, not of the UI |

UI tests fake the summary service with `page.route` at the boundary the browser actually crosses. That gives each test exact control over sequences (503, then 200), held responses and dropped connections. Every on-contract fake response is validated with the dashboard's own Zod parser, so the fakes can't drift into shapes the real service never sends. The smoke tests cover what faking in the browser can't: the integration itself.

## Determinism and parallel safety

- **Each test owns its data.** Tickets are created through a test-seeding endpoint that exists only when `ENABLE_TEST_SEEDING=1`, with server-assigned UUIDs, so no two tests share a ticket.
- **Browser fakes are per test.** They live in each test's own browser context. The fake AI service's state on the server, such as retry counters, is keyed by ticket ID.
- **There are no fixed waits.** Races are reproduced deliberately, not hoped for:
  - responses are held and released by the test
  - the 15-second client timeout runs on a **paused** `page.clock`, so the boundary at 14 999 ms vs 15 000 ms is exact
- **The mock queue is strict.** A request with no queued answer fails the test, which is how double submission is caught.
- **It's proven, not assumed:**
  - CI runs 4 workers with `fullyParallel`
  - every phase was checked with `--repeat-each=5`
  - API-APR-06 sends two approvals of the same ticket at the same moment and expects exactly one `200` and one `409`

## Do the tests actually catch what they claim?

Each important test was checked by deliberately breaking the code ("mutation probes") during development:

| Code broken on purpose | Tests that caught it |
|---|---|
| Citation rule `every` → `some` | DEV-01, API-APR-02, UI-05 (exactly these; the evaluation stays green) |
| Removing the late-response protection in the summary panel | UI-06, on every repetition |
| Grounding against the whole ticket instead of only cited messages | The `specific-from-uncited-message` evaluation example, reported as a false accept |
| `eval/` importing product code | ESLint (`no-restricted-imports`) |

The first row is permanent: the `gate-self-test` CI job re-checks it on every run, so the gate's ability to catch the regression is itself tested.

## Flakiness policy

- **Retries:** none locally. In CI, one retry plus `failOnFlakyTests`.
- **Why a pass-on-retry still blocks:** every outside service is faked, so a test that passes only on retry is a real defect, usually a race in the UI. The retry exists only to classify the failure and capture a second trace.
- **Quarantine is explicit:** tag the test `@quarantined` and link an issue. It then runs in an advisory job instead of the gate, and is never silently skipped. The linter forbids `test.skip` and `test.fixme` in gated folders.

## The summary evaluation

### Design

- **An answer key written by humans.** The dataset is `eval/dataset/` (5 tickets, 20 examples). Every example records which checks *should* fail. The test compares the exact set, so it distinguishes:
  - a **false accept**: a bad summary passed (the most severe)
  - a **false reject**: a good summary failed
  - the **right verdict for the wrong reason**
- **Checks independent of the product.** `eval/` is forbidden from importing `src/`. If it shared the product's citation rule, a bug in that rule would pass its own evaluation.
- **The extraction logic has its own tests.** Normalization equates `$49` with `49.00 USD`, `#48213` with `ORD-48213`, and `March 2, 2026` with `2026-03-02`. If that were wrong, every grounding verdict would be wrong, so `specific-extractors.eval.spec.ts` tests it.

### Why "grounded specifics" is the additional risk

Citations show where a claim came from, not whether it's true. The most damaging summary error is an invented specific that an agent then acts on: a wrong refund amount, a transposed order number, a wrong date or a made-up contact detail. It can be checked deterministically. It complements attribution instead of repeating it.

A fact found only in an **uncited** message also fails, because agents verify facts by following citations.

### Known blind spots

Two examples are labeled unacceptable by a human, yet every deterministic check passes them:

- `injection-amount-present-in-source`: the model follows a prompt injection whose `$500` is in the customer's own message.
- `meaning-reversed-refund-status`: "refund approved" when the agent wrote "denied".

They stay in the dataset and in the score table, without blocking a release. They make the checks' limits concrete, and if a future check starts catching one, its test fails and asks for the label to be updated.

### What these checks establish

**They do establish:**
- the summary's citations are valid and stay within the ticket
- every digit-bearing fact can be traced to cited text
- the checks themselves agree with human labels on the known cases

**They do not establish:**
- that a reworded summary is faithful
- that the summary is complete (covers what the customer actually asked)
- tone, or correct use of `insufficient_information`
- resistance to injection when the injected values are in the source
- meaning reversals, or facts without digits (names, promises)

## What to test against a live model

The `SummaryProvider` seam is where a live model plugs in; the same checks run unchanged on its output.

| Concern | Approach |
|---|---|
| Variation between runs | Sample N generations per ticket at production settings; gate on pass rates with confidence intervals, not on single runs |
| Faithfulness and completeness | A second model grades each summary. It's trusted only after its agreement with the human-labeled set has been measured |
| Hard cases | Prompt injection (including injected values in the source), long threads, multilingual tickets, PII-heavy tickets |
| Regressions | Compare the current and candidate model or prompt on the same tickets for every change |
| Operations | p95 response time and timeout rate against the UI's 15-second limit; cost per summary; how often `insufficient_information` is returned |
| Cadence | Nightly and on model or prompt changes, not on every pull request, because of cost and non-determinism |
| Production | Approval rate, regenerate rate, invalid-citation rate and agent edits, watched against the offline results |
