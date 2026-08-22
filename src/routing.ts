export type Route = '/' | '/inspect' | `/inspect?sample=${'png' | 'wav'}`;
export type View = 'landing' | 'inspect';

export function createRouter(baseUrl: string): {
  href: (route: Route) => string;
  pathname: (pathname: string) => string;
  currentView: () => View;
} {
  const basePath = baseUrl === '/' ? '' : baseUrl.replace(/\/$/, '');
  const href = (route: Route): string => `${basePath}${route}`;
  const pathname = (value: string): string => {
    if (!basePath) return value;
    if (value === basePath) return '/';
    return value.startsWith(`${basePath}/`) ? value.slice(basePath.length) : value;
  };
  return {
    href,
    pathname,
    currentView: () => pathname(window.location.pathname) === '/inspect' ? 'inspect' : 'landing',
  };
}
