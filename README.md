# AI Summary Release Gate

A Playwright + TypeScript release gate for an AI-assisted support-dashboard feature. An agent opens a ticket and clicks **Generate summary**. They can then approve a summary whose citations are valid, or retry a generation that failed.

Everything runs on synthetic data, with no credentials, paid services or external AI calls.

**Evidence that the gate works** (CI runs on this repository):

- ✅ [Green release gate on `main`](https://github.com/SanMantri/ai-summary-release-gate/actions/runs/44759296549). All four test jobs pass, so `release-gate` allows the release.
- ❌ [Pull request #2: intentional regression, merge blocked](https://github.com/SanMantri/ai-summary-release-gate/pull/2) by the required `release-gate` check.
  - [Its run](https://github.com/SanMantri/ai-summary-release-gate/actions/runs/44759313888) fails the unit, API and UI layers, each on its mixed-citation test.
  - The evaluation stays green.
- ❌ [Manual run with `inject_regression`](https://github.com/SanMantri/ai-summary-release-gate/actions/runs/44756522956). The same verdicts as the pull request, without needing a branch.

---

## Contents

- [How it fits together](#how-it-fits-together)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Observe the intentional regression](#observe-the-intentional-regression)
- [Release-blocking criteria](#release-blocking-criteria)
- [Where the line is drawn between test layers](#where-the-line-is-drawn-between-test-layers)
- [The summary evaluation](#the-summary-evaluation)
- [Investigating a red gate](#investigating-a-red-gate)
- [What I'd add next](#what-id-add-next)
- [Project structure](#project-structure)

Background: [`plan.md`](plan.md) is the spec this was built from, including the decision log. [`docs/test-strategy.md`](docs/test-strategy.md) explains the reasoning behind each layer.

## How it fits together

```
Browser UI ──▶ Dashboard API (Express 5, product code) ──▶ SummaryProvider (interface)
               GET  /api/tickets/:id                          ├─ FakeSummaryProvider  ← local + CI
               POST /api/tickets/:id/summary                  └─ LiveSummaryProvider  ← documented stub
               POST /api/tickets/:id/approve  (re-checks citations server-side)
src/domain/  citation rule + response contracts (Zod), shared by UI and API
```

- **Only the AI provider is fake.** The UI, API, ticket store and domain rules are real product code under test.
- **The fake AI service is deterministic.** Each ticket gets one of 8 behaviors (`ok`, `unavailable_then_ok`, `provider_timeout`, …). A live model would plug into the same `SummaryProvider` interface.
- **The citation rule has two conditions.** A summary is approvable only if it cites at least one message **and every** cited message belongs to the current ticket.
- **Approval is enforced in two places.** The UI disables the Approve button, and the API rejects invalid approvals with `422`. A disabled button is a convenience, not a safeguard.

## Quick start

Prerequisites:
- Node.js 24 or newer (26 recommended, see `.nvmrc`)
- npm 11.20 or newer, which comes with Node 26. npm prints a warning if yours is older.
- macOS or Linux. On Windows, use WSL or Git Bash, because two scripts set environment variables with POSIX syntax.

```bash
npm ci
npx playwright install chromium
npm run test:gate          # static checks, unit tests, API/UI/smoke/evaluation suites
```

To try the dashboard yourself:

```bash
npm start                  # http://localhost:5179
```

The demo comes with five synthetic tickets, one for each state:
- **"Charged twice for one order":** a valid summary that you can approve
- **"Hello?":** not enough information to summarize
- **"Locked out after password reset":** the AI service is unavailable on the first try; retry recovers
- **"Headphones arrived broken":** the summary cites another ticket, so approval is blocked
- **"Invoice address change":** the AI service is always unavailable

## Commands

| Command | What it runs | Blocks a release? |
|---|---|---|
| `npm run test:gate` | Everything the CI gate runs: static checks, unit tests, then the API, UI, smoke and evaluation suites | yes |
| `npm run check:static` | Type-check (Node and browser code checked separately), ESLint, Prettier | yes |
| `npm run test:unit` | Developer unit tests (Vitest), next to the code they test | yes |
| `npm run test:api` | API tests: response contract, error mapping, server-side approval enforcement | yes |
| `npm run test:ui` | UI tests in Chromium, with the AI service faked in the browser | yes |
| `npm run test:smoke` | Full-stack smoke tests: nothing faked in the browser | yes |
| `npm run test:eval` | Deterministic summary evaluation | yes |
| `npm run regression:apply` / `regression:revert` | Inject or remove the intentional regression | — |
| `npm run report` | Open the last Playwright HTML report | — |
| `npm start` / `npm run dev` | Demo server / dev server with reload | — |

## Observe the intentional regression

The regression is a realistic one-word bug: the citation rule uses `some` where it needs `every`. A summary that cites one valid message plus a message from **another customer's ticket** then becomes approvable.

**Locally:**

```bash
npm run regression:apply     # git apply regressions/citation-rule-some-instead-of-every.patch
npm run test:gate            # red
npm run regression:revert
```

Expected result: the run stops at the unit tests. To see every layer's verdict, run the layers one by one:

| Layer | Result with the regression applied |
|---|---|
| `npm run test:unit` | ❌ DEV-01: "rejects a valid message plus a message from another ticket" |
| `npm run test:api` | ❌ API-APR-02: expected 422, received 200 |
| `npm run test:ui` | ❌ UI-05: Approve is enabled for a summary citing another ticket |
| `npm run test:eval` | ✅ green, by design. The evaluation never imports product code, so a product bug can't make it pass or fail. |

**In CI**, there are two ways:
- Pull request [#2 "Demo: intentional regression — do not merge"](https://github.com/SanMantri/ai-summary-release-gate/pull/2). It contains the regression; its required `release-gate` check is red, so GitHub shows "Merging is blocked".
- Run the **release-gate** workflow manually (Actions → release-gate → Run workflow) with **inject_regression** ticked.

## Release-blocking criteria

A change can't be released if any of these is true:

1. There are type errors, lint errors or formatting violations.
2. Any developer unit test fails.
3. Any API test fails: response contract, error mapping or approval enforcement.
4. Any UI or smoke test fails on Chromium, **or passes only on retry**. A test that passes only on retry is flaky, and flaky tests block.
5. Any evaluation example disagrees with its human label. False accepts, where a bad summary passed, are reported first.
6. A test is focused (`.only`) or skipped.

Every job in the workflow blocks; there are no advisory jobs. The UI runs in Chromium only. The risks the gate guards are citation and approval-state logic, which don't change between browser engines, so extra browsers would add CI time without adding protection.

How the workflow enforces this:
- **One required check.** A ruleset on `main` requires `release-gate` and nothing else, so the job list can change without touching branch protection. Changes reach `main` through a pull request; deletion and force pushes are blocked. `release-gate` always runs, and it fails unless every blocking job *succeeded*. This closes a common hole: GitHub skips the jobs after a failed job, and a skipped required check counts as passing.
- **Flaky tests.** In CI each test gets one retry plus `failOnFlakyTests`. The retry only classifies the failure (flaky, or failing every time) and records a second trace. Every outside service is faked, so flakiness signals a real bug.
- **No skipped tests.** The linter forbids `.only`, `test.skip` and `test.fixme`, and CI forbids `.only`. A flaky test is fixed, or deleted with an issue linked; it is never quietly switched off.

## Where the line is drawn between test layers

Each layer proves one thing. Combinations are tested at the lowest layer that can test them; the browser covers only what only the browser can show.

| Layer | Owner | Proves | Leaves to other layers |
|---|---|---|---|
| Developer unit (Vitest, `src/**/*.test.ts`, 11 tests) | Developer | The citation rule (valid, empty, missing, another ticket's, mixed); reading the three service responses and a missing citation list; the test-seeding endpoint stays off unless enabled | Anything over HTTP or in a browser |
| API (`tests/api`, no browser, 6 tests) | SDET | The three summary responses at the service boundary; the **server** refuses approval for missing and cross-ticket citations | What the agent sees |
| UI (`tests/ui`, Chromium, AI service faked in the browser, 6 tests) | SDET | What the agent sees and can click: a valid summary approved, insufficient information, 503 then retry, a retry that returns an invalid summary, missing and cross-ticket citations | That the UI and API agree |
| Smoke (`tests/smoke`, nothing faked in the browser, 2 tests) | SDET | The real path from UI to API to the fake AI service works | Edge cases |
| Evaluation (`eval/`, no browser) | SDET / ML | The checks classify every labeled example correctly | A live model's quality |

The test catalog is in [`plan.md` §5](plan.md#5-test-catalog). Each test's catalog ID, such as `UI-05`, is recorded as an annotation on the test.

## The summary evaluation

`eval/` has 5 synthetic tickets and 20 labeled model outputs. Two deterministic checks run on each output:

- **`source-attribution`:** at least one citation, and every cited message belongs to this ticket. Findings separate a citation from another ticket (a cross-customer data leak) from an ID that exists nowhere (an invented ID).
- **`grounded-specifics`:** the one additional risk. Citations show *where* a claim came from, not *whether it is true*. Every concrete fact in the summary must appear, after normalization, in a **cited** message: money amounts, order or reference numbers, dates, email addresses, phone numbers and percentages. For example, `$49` matches `49.00 USD`, and `March 2, 2026` matches `2026-03-02`. This catches "cites the right message, invents the refund amount".

How the examples are scored:
- **Each example is one test.** The test compares the *exact set* of failed checks with the human label. That catches false accepts, false rejects, and the right verdict for the wrong reason.
- **Two known blind spots are kept in the dataset:**
  - a prompt-injected refund amount that appears in the customer's own message
  - a summary that says "approved" when the agent said "denied"

  They're reported but don't block a release. If a future check starts catching one, its test fails and asks you to relabel it.
- **Separation from product code is enforced.** ESLint forbids `eval/` from importing product code, so a product bug can't pass its own evaluation.
- **Results show up on the run page.** A score table goes to the GitHub Actions job summary and to `release-gate-evidence/summary-evaluation-scorecard.{md,json}`.

**What these checks establish:** citations are valid and stay within the ticket, and concrete facts with digits can be traced to cited text. The checks are themselves verified against human labels, including the known misses.

**What they don't establish:**
- that a reworded summary is faithful to the ticket
- that the summary is complete
- tone
- whether the model follows an injected instruction when the injected values are already in the source
- reversed meaning
- whether `insufficient_information` is used at the right times
- response time, cost, or behavior across repeated runs of a real model

**What I'd test separately against a live model:**
- pass rates over many generations per ticket, with confidence thresholds
- a second model grading faithfulness and completeness, calibrated against human labels first
- sets of hard cases: injection, long threads, other languages, personal data
- comparing the current and candidate model or prompt on every change
- p95 response time and timeout rate against the UI's 15-second limit
- cost per summary

These would run nightly and on every model or prompt change, not on every pull request. Details are in [`docs/test-strategy.md`](docs/test-strategy.md#what-to-test-against-a-live-model).

## Investigating a red gate

1. **Open the failed run's summary page.** Each job lists its failed tests: catalog ID, title, file and line, outcome (failed or flaky), and Expected/Received values.
2. **Download the job's evidence artifact.** It's named after the job and attempt, for example `ui-tests-evidence-attempt-1`, and kept for 14 days.
3. **Open `playwright-report/index.html`.** Every failure has its trace, screenshot, video and a `server-log.jsonl` attachment. That attachment has only the server log lines caused by that test: every request carries an `x-test-id` header, and the server logs it.
4. **Open a trace:** `npx playwright show-trace <trace.zip>`.
5. **Read the rest of the folder.** `release-gate-evidence/` also has JUnit XML, the full server log and the evaluation scorecard.

## What I'd add next

- **The edge-case tests cut to keep this suite minimal.** The dashboard already handles these; the tests would prove it:
  - a late summary from the previous ticket after switching tickets
  - a double click sending only one request
  - the 15-second client timeout
  - broken responses (HTTP 500, unreadable JSON, dropped connection)
  - a failed approval, and regenerating after a valid summary
  - markup in model output shown as text
  - API error mapping (provider crash or timeout → 503, broken output → 502) and two simultaneous approvals
- **A gate self-test:** a CI job that applies the intentional regression and fails unless exactly the expected tests catch it, so nobody can silently weaken them.
- **A live-model evaluation lane:** the same checks with pass-rate thresholds, plus a second model grading faithfulness and completeness.
- **Approval by `generationId`:** the server keeps a record of each generation, so edited text can't be approved, plus an audit trail.
- **Dedicated checks** for personal data and for obeying prompt injections.
- **`grounded-specifics` in production in observe-only mode.** It would measure how often it wrongly flags good summaries before anyone considers blocking on it.
- **Accessibility scans** (axe), advisory at first and blocking later.
- **Contract tests against the real summary service,** checking it meets what the dashboard expects.
- **Screenshot comparison** of the summary panel's states.
- **Running the suite in parallel shards** with merged reports as it grows.
- **Mutation testing** of the domain rules.
- **Production monitoring:** approval rate, regenerate rate, invalid-citation rate.

## Project structure

```
src/domain/          citation rule, summary + approval contracts (shared by UI and API)
src/server/          Express API, ticket store, summary-provider seam, fake provider, test seeding
src/dashboard-ui/    vanilla TypeScript dashboard (ticket list, ticket detail, summary panel)
tests/api/           API suite                     tests/ui/     UI suite (summary faked in browser)
tests/smoke/         full-stack smoke              tests/support/ fixtures, mocks, page object, builders
eval/                checks, labeled dataset, evaluation spec
reporting/           release-gate summary + evaluation scorecard reporter
regressions/         the intentional regression patch
.github/             release-gate workflow, shared setup/evidence actions
plan.md              approved spec and decision log
docs/test-strategy.md
```
