import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG } from '../model/defaults';
import type { LineItem } from '../model/types';
import { groupItems, moveItem, sortByCategory } from './items';

const cats = DEFAULT_CATALOG.categories;
const line = (id: string, categoryId: string): LineItem => ({
  id,
  categoryId,
  name: id,
  description: '',
  qty: 1,
  unitPrice: 1,
  priceIncludesVat: true,
});

describe('item grouping and ordering', () => {
  const items = [line('pizza', 'food'), line('lesson', 'events'), line('drinks', 'food'), line('ghost', 'deleted-category')];

  it('orders by category, keeping the user order inside each category', () => {
    expect(sortByCategory(items, cats).map((i) => i.id)).toEqual(['lesson', 'pizza', 'drinks', 'ghost']);
  });

  it('puts items of deleted categories under "other"', () => {
    const groups = groupItems(items, cats);
    expect(groups.map((g) => g.category.id)).toEqual(['events', 'food', 'other']);
  });

  it('moves items only within their category', () => {
    expect(moveItem(items, 'drinks', -1, cats).map((i) => i.id)).toEqual(['lesson', 'drinks', 'pizza', 'ghost']);
    expect(moveItem(items, 'pizza', -1, cats)).toBe(items);
    expect(moveItem(items, 'lesson', -1, cats)).toBe(items);
  });
});
