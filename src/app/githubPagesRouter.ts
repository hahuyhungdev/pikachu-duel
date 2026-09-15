const GITHUB_PAGES_BASENAME = '/pikachu-duel';
const GITHUB_PAGES_ROUTE_PARAM = '__route';

export function restoreGitHubPagesRoute(): void {
  const route = new URLSearchParams(window.location.search).get(GITHUB_PAGES_ROUTE_PARAM);
  if (!route?.startsWith('/') || route.startsWith('//')) return;

  window.history.replaceState(
    window.history.state,
    '',
    `${GITHUB_PAGES_BASENAME}${route}`,
  );
}

export function resolveRouterBasename(pathname = window.location.pathname): string | undefined {
  return pathname === GITHUB_PAGES_BASENAME || pathname.startsWith(`${GITHUB_PAGES_BASENAME}/`)
    ? GITHUB_PAGES_BASENAME
    : undefined;
}
