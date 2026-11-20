// Phase 0 placeholder — the ticket list, ticket detail and summary panel arrive in Phase 3 (see plan.md §3.7).
const dashboardRoot = document.querySelector<HTMLElement>('#dashboard-app');

if (!dashboardRoot) {
  throw new Error('Dashboard root element #dashboard-app is missing from index.html');
}

const pageHeading = document.createElement('h1');
pageHeading.textContent = 'Support Dashboard';
dashboardRoot.append(pageHeading);
