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

1. There are type, lint or formatting errors.
2. Any unit, API, UI or smoke test fails, **or passes only on retry**. Every outside service is faked, so a flaky test is a real bug.
3. Any evaluation example disagrees with its human label.
4. A test is focused (`.only`) or skipped.

All four CI jobs block. A ruleset on `main` requires one check, `release-gate`. It runs even when other jobs fail (`if: always()`) and passes only if every job *succeeded*, so a skipped job can't open the gate.

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

`eval/` scores 20 labeled model outputs for 5 synthetic tickets with two deterministic checks:

- **`source-attribution`:** at least one citation, and every cited message belongs to this ticket.
- **`grounded-specifics`** (the additional risk): every concrete fact (amount, order number, date, email, phone) must appear in a **cited** message after normalization, so `$49` matches `49.00 USD`. This catches "cites the right message, invents the refund amount".

Each example is one test and must fail exactly the checks a human expected. Two known blind spots, an injected amount that really is in the source and "approved" where the agent said "denied", are reported but don't block. `eval/` can't import product code, so a product bug can't pass its own evaluation.

**What the checks don't establish:** that reworded text is faithful, complete or correct in meaning. **Against a live model** I'd add pass rates over many generations, a second model grading faithfulness (calibrated on human labels), hard cases such as injection, long threads and personal data, and response time and cost, run on every model or prompt change. Details are in [`docs/test-strategy.md`](docs/test-strategy.md#the-summary-evaluation).

## Investigating a red gate

1. **Open the failed run's summary page.** Each job lists its failed tests: catalog ID, title, file and line, outcome (failed or flaky), and Expected/Received values.
2. **Download the job's evidence artifact.** It's named after the job and attempt, for example `ui-tests-evidence-attempt-1`, and kept for 14 days.
3. **Open `playwright-report/index.html`.** Every failure has its trace, screenshot, video and a `server-log.jsonl` attachment. That attachment has only the server log lines caused by that test: every request carries an `x-test-id` header, and the server logs it.
4. **Open a trace:** `npx playwright show-trace <trace.zip>`.
5. **Read the rest of the folder.** `release-gate-evidence/` also has JUnit XML, the full server log and the evaluation scorecard.

## What I'd add next

- **The edge-case tests cut to keep the suite minimal:** a late answer after switching tickets, double clicks, the 15-second timeout, broken responses, markup in model output, and API error mapping.
- **A gate self-test:** a CI job that fails unless the intentional regression is caught by exactly the expected tests.
- **A live-model evaluation lane,** as described above.
- **Approval tied to a server-side `generationId`,** with an audit trail.
- **Accessibility scans and contract tests** against the real summary service.
- **Production monitoring:** approval, regenerate and invalid-citation rates.

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
