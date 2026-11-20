import type { Ticket } from '../domain/ticket';

export type TicketDetailView =
  | { kind: 'no-ticket-selected' }
  | { kind: 'loading' }
  | { kind: 'not-found'; ticketId: string }
  | { kind: 'load-failed'; reason: string }
  | { kind: 'ticket'; ticket: Ticket };

export function renderTicketDetail(container: HTMLElement, view: TicketDetailView): void {
  switch (view.kind) {
    case 'no-ticket-selected':
      container.replaceChildren(emptyState('Select a ticket to see its conversation.'));
      return;
    case 'loading':
      container.replaceChildren(emptyState('Loading ticket…'));
      return;
    case 'not-found':
      container.replaceChildren(emptyState(`Ticket ${view.ticketId} was not found.`));
      return;
    case 'load-failed':
      container.replaceChildren(emptyState(`The ticket could not be loaded (${view.reason}).`));
      return;
    case 'ticket':
      container.replaceChildren(...renderTicket(view.ticket));
      return;
  }
}

function renderTicket(ticket: Ticket): HTMLElement[] {
  const heading = document.createElement('h2');
  heading.textContent = ticket.subject;

  const customerLine = document.createElement('p');
  customerLine.className = 'customer-line';
  customerLine.textContent = `Customer: ${ticket.customerName}`;

  const messageList = document.createElement('ol');
  messageList.className = 'message-list';
  messageList.setAttribute('aria-label', 'Messages');

  for (const message of ticket.messages) {
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('span');
    author.textContent = message.author === 'customer' ? ticket.customerName : 'Support agent';
    const messageId = document.createElement('code');
    messageId.textContent = message.id;
    const sentAt = document.createElement('time');
    sentAt.dateTime = message.sentAt;
    sentAt.textContent = new Date(message.sentAt).toLocaleString();
    meta.append(author, messageId, sentAt);

    const body = document.createElement('p');
    body.className = 'message-body';
    body.textContent = message.body;

    const item = document.createElement('li');
    item.id = `message-${message.id}`;
    item.append(meta, body);
    messageList.append(item);
  }

  return [heading, customerLine, messageList];
}

function emptyState(text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-state';
  paragraph.textContent = text;
  return paragraph;
}
