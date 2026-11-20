import { validateCitations, type CitationProblem } from '../domain/citation-validation';
import { messageIdsOf, type Ticket } from '../domain/ticket';
import { approveSummary, requestSummary } from './dashboard-api-client';
import { summaryRequestTimeoutMs } from './dashboard-settings';

type GenerationAction = 'generate' | 'retry' | 'regenerate';

interface ShownSummary {
  summary: string;
  sourceIds: string[];
}

/** The summary panel's states (plan.md §3.7). Every transition re-renders the panel. */
type SummaryPanelState =
  | { name: 'no-ticket' }
  | { name: 'idle' }
  | { name: 'generating'; action: GenerationAction }
  | { name: 'summary-ready'; shown: ShownSummary }
  | { name: 'summary-blocked'; shown: ShownSummary; problems: CitationProblem[] }
  | { name: 'insufficient-information' }
  | { name: 'generation-failed' }
  | { name: 'approving'; shown: ShownSummary }
  | { name: 'approval-failed'; shown: ShownSummary }
  | { name: 'approved'; shown: ShownSummary };

const generationButtonLabels: Record<GenerationAction, string> = {
  generate: 'Generate summary',
  retry: 'Retry',
  regenerate: 'Regenerate summary',
};

export class SummaryPanel {
  readonly #container: HTMLElement;
  #ticket: Ticket | undefined;
  #state: SummaryPanelState = { name: 'no-ticket' };
  /** Increases whenever earlier requests must be ignored (new request or ticket switch). */
  #currentRequestNumber = 0;
  #inFlightRequest: AbortController | undefined;

  constructor(container: HTMLElement) {
    this.#container = container;
    this.#render();
  }

  showTicket(ticket: Ticket | undefined): void {
    this.#abandonInFlightRequest();
    this.#ticket = ticket;
    if (!ticket) {
      this.#setState({ name: 'no-ticket' });
    } else if (ticket.approvedSummary) {
      const { summary, sourceIds } = ticket.approvedSummary;
      this.#setState({ name: 'approved', shown: { summary, sourceIds } });
    } else {
      this.#setState({ name: 'idle' });
    }
  }

  async #generateSummary(action: GenerationAction): Promise<void> {
    const ticket = this.#ticket;
    if (!ticket || this.#state.name === 'generating') {
      return;
    }

    this.#abandonInFlightRequest();
    const requestNumber = this.#currentRequestNumber;
    const cancellation = new AbortController();
    this.#inFlightRequest = cancellation;
    const timeoutTimer = window.setTimeout(() => cancellation.abort(), summaryRequestTimeoutMs);
    this.#setState({ name: 'generating', action });

    const outcome = await requestSummary(ticket.id, cancellation.signal);
    window.clearTimeout(timeoutTimer);

    // A late answer for an earlier request or a previous ticket must never reach this panel.
    if (requestNumber !== this.#currentRequestNumber || this.#ticket?.id !== ticket.id) {
      return;
    }
    this.#inFlightRequest = undefined;

    switch (outcome.kind) {
      case 'summary': {
        // Eligibility is recomputed for every generation; it is never carried over.
        const citationValidation = validateCitations(outcome.sourceIds, messageIdsOf(ticket));
        const shown = { summary: outcome.summary, sourceIds: outcome.sourceIds ?? [] };
        this.#setState(
          citationValidation.citationsAreValid
            ? { name: 'summary-ready', shown }
            : { name: 'summary-blocked', shown, problems: citationValidation.problems },
        );
        return;
      }
      case 'insufficient-information':
        this.#setState({ name: 'insufficient-information' });
        return;
      case 'unavailable':
      case 'off-contract':
      case 'network-failure':
        this.#setState({ name: 'generation-failed' });
        return;
    }
  }

  async #approveShownSummary(): Promise<void> {
    const ticket = this.#ticket;
    const state = this.#state;
    if (!ticket || (state.name !== 'summary-ready' && state.name !== 'approval-failed')) {
      return;
    }

    const requestNumber = this.#currentRequestNumber;
    this.#setState({ name: 'approving', shown: state.shown });
    const outcome = await approveSummary(ticket.id, state.shown);

    if (requestNumber !== this.#currentRequestNumber || this.#ticket?.id !== ticket.id) {
      return;
    }
    this.#setState(
      outcome.kind === 'approved'
        ? { name: 'approved', shown: state.shown }
        : { name: 'approval-failed', shown: state.shown },
    );
  }

  #abandonInFlightRequest(): void {
    this.#currentRequestNumber += 1;
    this.#inFlightRequest?.abort();
    this.#inFlightRequest = undefined;
  }

  #setState(state: SummaryPanelState): void {
    this.#state = state;
    this.#render();
  }

  #render(): void {
    const state = this.#state;
    const panelContent: HTMLElement[] = [createElement('h2', 'AI summary')];
    this.#container.setAttribute('aria-busy', String(state.name === 'generating'));

    switch (state.name) {
      case 'no-ticket':
        panelContent.push(
          createElement('p', 'Open a ticket to generate an AI summary.', 'empty-state'),
        );
        break;
      case 'idle':
        panelContent.push(
          this.#actions({ generation: 'generate', generationEnabled: true, approveEnabled: false }),
        );
        break;
      case 'generating':
        panelContent.push(
          notice('status', 'Generating summary…'),
          this.#actions({
            generation: state.action,
            generationEnabled: false,
            approveEnabled: false,
          }),
        );
        break;
      case 'summary-ready':
        panelContent.push(
          renderSummary(state.shown, this.#ticket),
          this.#actions({
            generation: 'regenerate',
            generationEnabled: true,
            approveEnabled: true,
          }),
        );
        break;
      case 'summary-blocked':
        panelContent.push(
          renderCitationWarning(state.problems),
          renderSummary(state.shown, this.#ticket),
          this.#actions({
            generation: 'regenerate',
            generationEnabled: true,
            approveEnabled: false,
          }),
        );
        break;
      case 'insufficient-information':
        panelContent.push(
          notice('status', 'Not enough information in this ticket to summarize yet.', 'warning'),
          this.#actions({
            generation: 'regenerate',
            generationEnabled: true,
            approveEnabled: false,
          }),
        );
        break;
      case 'generation-failed':
        panelContent.push(
          notice('alert', 'Summary generation is unavailable right now.', 'error'),
          this.#actions({ generation: 'retry', generationEnabled: true, approveEnabled: false }),
        );
        break;
      case 'approving':
        panelContent.push(
          notice('status', 'Approving…'),
          renderSummary(state.shown, this.#ticket),
          this.#actions({
            generation: 'regenerate',
            generationEnabled: false,
            approveEnabled: false,
          }),
        );
        break;
      case 'approval-failed':
        panelContent.push(
          notice('alert', 'Approval failed. Try again.', 'error'),
          renderSummary(state.shown, this.#ticket),
          this.#actions({
            generation: 'regenerate',
            generationEnabled: true,
            approveEnabled: true,
          }),
        );
        break;
      case 'approved':
        panelContent.push(
          notice('status', 'Summary approved', 'success'),
          renderSummary(state.shown, this.#ticket),
        );
        break;
    }

    this.#container.replaceChildren(...panelContent);
  }

  #actions(options: {
    generation: GenerationAction;
    generationEnabled: boolean;
    approveEnabled: boolean;
  }): HTMLElement {
    const generationButton = createButton(
      generationButtonLabels[options.generation],
      options.generationEnabled,
    );
    generationButton.addEventListener('click', () => {
      void this.#generateSummary(options.generation);
    });

    const approveButton = createButton('Approve summary', options.approveEnabled, 'primary');
    approveButton.addEventListener('click', () => {
      void this.#approveShownSummary();
    });

    const actions = createElement('div', undefined, 'summary-actions');
    actions.append(generationButton, approveButton);
    return actions;
  }
}

function renderSummary(shown: ShownSummary, ticket: Ticket | undefined): HTMLElement {
  const section = createElement('section', undefined, 'summary-result');

  // Model output is untrusted: it is always rendered as text, never as HTML.
  const summaryText = createElement('p', shown.summary, 'summary-text');
  summaryText.dataset.testid = 'summary-text';
  section.append(summaryText);

  if (shown.sourceIds.length === 0) {
    section.append(createElement('p', 'No cited messages.', 'empty-state'));
    return section;
  }

  const ticketMessageIds = ticket ? messageIdsOf(ticket) : new Set<string>();
  const citationList = createElement('ul', undefined, 'citation-list');
  citationList.setAttribute('aria-label', 'Citations');
  for (const messageId of new Set(shown.sourceIds)) {
    const item = document.createElement('li');
    if (ticketMessageIds.has(messageId)) {
      const link = createElement('a', messageId);
      link.setAttribute('href', `#message-${messageId}`);
      item.append(link);
    } else {
      item.append(createElement('span', `${messageId} (not in this ticket)`, 'invalid-citation'));
    }
    citationList.append(item);
  }
  section.append(createElement('h3', 'Cited messages'), citationList);
  return section;
}

function renderCitationWarning(problems: CitationProblem[]): HTMLElement {
  const warning = notice(
    'alert',
    'Citations could not be verified. Approval is disabled.',
    'warning',
  );
  const problemList = document.createElement('ul');
  for (const problem of problems) {
    problemList.append(createElement('li', describeCitationProblem(problem)));
  }
  warning.append(problemList);
  return warning;
}

function describeCitationProblem(problem: CitationProblem): string {
  switch (problem.code) {
    case 'no_citations':
      return 'This summary does not cite any message from this ticket.';
    case 'citation_not_in_ticket':
      return `Message ${problem.messageId} is not part of this ticket.`;
  }
}

function notice(role: 'status' | 'alert', text: string, tone?: string): HTMLElement {
  const element = createElement('div', undefined, tone ? `notice ${tone}` : 'notice');
  element.setAttribute('role', role);
  element.append(createElement('strong', text));
  return element;
}

function createButton(label: string, enabled: boolean, className?: string): HTMLButtonElement {
  const button = createElement('button', label, className);
  button.type = 'button';
  button.disabled = !enabled;
  return button;
}

function createElement<TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[TagName] {
  const element = document.createElement(tagName);
  if (text !== undefined) {
    element.textContent = text;
  }
  if (className) {
    element.className = className;
  }
  return element;
}
