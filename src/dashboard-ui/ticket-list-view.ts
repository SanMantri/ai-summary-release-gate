import type { TicketListItem } from '../domain/ticket';

export function renderTicketList(
  container: HTMLElement,
  tickets: TicketListItem[],
  activeTicketId: string | undefined,
  onTicketSelected: (ticketId: string) => void,
): void {
  const heading = document.createElement('h2');
  heading.textContent = 'Tickets';

  const list = document.createElement('ul');
  for (const ticket of tickets) {
    const link = document.createElement('a');
    link.href = `/tickets/${encodeURIComponent(ticket.id)}`;
    link.textContent = ticket.subject;
    if (ticket.id === activeTicketId) {
      link.setAttribute('aria-current', 'page');
    }

    const customerName = document.createElement('span');
    customerName.className = 'customer-name';
    customerName.textContent = ticket.customerName;
    link.append(customerName);

    link.addEventListener('click', (event) => {
      event.preventDefault();
      onTicketSelected(ticket.id);
    });

    const item = document.createElement('li');
    item.append(link);
    list.append(item);
  }

  container.replaceChildren(heading, list);
}
