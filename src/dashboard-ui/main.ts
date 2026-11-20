import type { TicketListItem } from '../domain/ticket';
import { fetchTicket, fetchTicketList } from './dashboard-api-client';
import { SummaryPanel } from './summary-panel';
import { renderTicketDetail } from './ticket-detail-view';
import { renderTicketList } from './ticket-list-view';

const ticketListContainer = requireElement('#ticket-list');
const ticketDetailContainer = requireElement('#ticket-detail');
const summaryPanel = new SummaryPanel(requireElement('#summary-panel'));

let ticketList: TicketListItem[] = [];
/** Increases on every navigation, so a slow ticket load cannot overwrite a newer one. */
let currentNavigationNumber = 0;

function ticketIdFromPath(pathname: string): string | undefined {
  const match = /^\/tickets\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function showCurrentRoute(): Promise<void> {
  const navigationNumber = ++currentNavigationNumber;
  const ticketId = ticketIdFromPath(window.location.pathname);

  renderTicketList(ticketListContainer, ticketList, ticketId, navigateToTicket);
  // Leaving a ticket abandons its in-flight summary request immediately.
  summaryPanel.showTicket(undefined);

  if (!ticketId) {
    renderTicketDetail(ticketDetailContainer, { kind: 'no-ticket-selected' });
    return;
  }

  renderTicketDetail(ticketDetailContainer, { kind: 'loading' });
  try {
    const ticket = await fetchTicket(ticketId);
    if (navigationNumber !== currentNavigationNumber) {
      return;
    }
    renderTicketDetail(
      ticketDetailContainer,
      ticket ? { kind: 'ticket', ticket } : { kind: 'not-found', ticketId },
    );
    summaryPanel.showTicket(ticket);
  } catch (error) {
    if (navigationNumber === currentNavigationNumber) {
      renderTicketDetail(ticketDetailContainer, {
        kind: 'load-failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function navigateToTicket(ticketId: string): void {
  window.history.pushState({}, '', `/tickets/${encodeURIComponent(ticketId)}`);
  void showCurrentRoute();
}

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Dashboard element ${selector} is missing from index.html`);
  }
  return element;
}

async function startDashboard(): Promise<void> {
  try {
    ticketList = await fetchTicketList();
  } catch (error) {
    console.error('Loading the ticket list failed', error);
  }
  await showCurrentRoute();
}

window.addEventListener('popstate', () => {
  void showCurrentRoute();
});
void startDashboard();
