import { signal } from '@preact/signals';

export type Route =
  | { name: 'quotes' }
  | { name: 'quote'; id: string }
  | { name: 'catalog' }
  | { name: 'settings' };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, id] = path.split('/');
  if (head === 'q' && id) return { name: 'quote', id: decodeURIComponent(id) };
  if (head === 'catalog') return { name: 'catalog' };
  if (head === 'settings') return { name: 'settings' };
  return { name: 'quotes' };
}

export const route = signal<Route>(parse(location.hash));
window.addEventListener('hashchange', () => {
  route.value = parse(location.hash);
  window.scrollTo(0, 0);
});

export const href = {
  quotes: '#/',
  quote: (id: string) => `#/q/${encodeURIComponent(id)}`,
  catalog: '#/catalog',
  settings: '#/settings',
};

export function navigate(to: string): void {
  location.hash = to;
}
