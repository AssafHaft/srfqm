import { OTHER_CATEGORY_ID } from '../model/defaults';
import type { Category, LineItem } from '../model/types';

export interface ItemGroup {
  category: Category;
  items: LineItem[];
}

/** Items whose category was deleted fall back to "other" (which cannot be deleted). */
export function effectiveCategoryId(categoryId: string, categories: Category[]): string {
  return categories.some((c) => c.id === categoryId) ? categoryId : OTHER_CATEGORY_ID;
}

function rank(categories: Category[]): (item: LineItem) => number {
  const index = new Map(categories.map((c, i) => [c.id, i]));
  return (item) => index.get(effectiveCategoryId(item.categoryId, categories)) ?? categories.length;
}

/** Stable sort into category order, keeping the user's order inside each category. */
export function sortByCategory(items: LineItem[], categories: Category[]): LineItem[] {
  const r = rank(categories);
  return items
    .map((item, i) => ({ item, i, r: r(item) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

export function groupItems(items: LineItem[], categories: Category[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  for (const item of sortByCategory(items, categories)) {
    const id = effectiveCategoryId(item.categoryId, categories);
    let group = groups.get(id);
    if (!group) {
      const category = categories.find((c) => c.id === id) ?? { id, name: 'שונות' };
      group = { category, items: [] };
      groups.set(id, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

/** Moves an item one step up/down within its category. Returns the same array when the move is impossible. */
export function moveItem(items: LineItem[], id: string, direction: -1 | 1, categories: Category[]): LineItem[] {
  const sorted = sortByCategory(items, categories);
  const from = sorted.findIndex((it) => it.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sorted.length) return items;
  const cat = (it: LineItem) => effectiveCategoryId(it.categoryId, categories);
  if (cat(sorted[from]) !== cat(sorted[to])) return items;
  const next = sorted.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
