import { useState } from 'preact/hooks';
import { Icon } from '../components/icons';
import { AutoTextArea, NumberInput } from '../components/inputs';
import { toast } from '../components/toast';
import { newId } from '../lib/ids';
import { effectiveCategoryId } from '../lib/items';
import { OTHER_CATEGORY_ID } from '../model/defaults';
import type { CatalogItem, Category } from '../model/types';
import { href } from '../router';
import { downloadJson } from '../store/backup';
import { catalog, deleteCatalogItem, deleteCategory, exportData, setCategories, settings, upsertCatalogItem } from '../store/store';
import { ImportButton } from './ImportButton';
import { PackagesCard } from './PackagesCard';
import { backupFileName } from './QuotesList';

export function CatalogView() {
  const { categories, items } = catalog.value;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (i: CatalogItem) => !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);

  return (
    <div class="page">
      <div class="page__head">
        <h1 class="page__title">קטלוג ומחירון</h1>
        <div class="btn-row">
          <button
            type="button"
            class="btn"
            onClick={() => {
              downloadJson(exportData('catalog'), backupFileName('catalog'));
              toast('קובץ המחירון נשמר');
            }}
          >
            <Icon name="pdf" />
            ייצוא מחירון
          </button>
          <ImportButton label="טעינת מחירון" />
        </div>
      </div>

      <div class="notice notice--info">
        <Icon name="lock" />
        <span>
          המחירון נשמר רק במכשיר זה ובקבצים שאתם מייצאים — לא באתר עצמו. המחירים בקטלוג{' '}
          <strong>{settings.value.catalogPricesIncludeVat ? 'כוללים מע"מ' : 'אינם כוללים מע"מ'}</strong> (
          <a href={href.settings}>שינוי בהגדרות</a>).
        </span>
      </div>

      <PackagesCard />

      <CategoriesCard categories={categories} />

      <div class="search">
        <Icon name="search" />
        <input class="input" type="search" placeholder="חיפוש בקטלוג" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      </div>

      {categories.map((c) => {
        const inCat = items.filter((i) => effectiveCategoryId(i.categoryId, categories) === c.id && matches(i));
        if (q && inCat.length === 0) return null;
        return (
          <section class="card" key={c.id}>
            <div class="card__head">
              <h2 class="card__title">{c.name}</h2>
              <span class="card__meta">{inCat.length} פריטים</span>
            </div>
            {inCat.map((item) => (
              <CatalogRow key={item.id} item={item} categories={categories} />
            ))}
            <button
              type="button"
              class="btn btn--ghost"
              onClick={() => upsertCatalogItem({ id: newId(), categoryId: c.id, name: '', description: '', price: 0 })}
            >
              <Icon name="plus" />
              פריט חדש ב{c.name}
            </button>
          </section>
        );
      })}
    </div>
  );
}

function CatalogRow({ item, categories }: { item: CatalogItem; categories: Category[] }) {
  const set = (patch: Partial<CatalogItem>) => upsertCatalogItem({ ...item, ...patch });
  return (
    <div class="catalog-row">
      <div class="catalog-row__text">
        <input class="input" value={item.name} placeholder="שם הפריט" aria-label="שם הפריט" onInput={(e) => set({ name: e.currentTarget.value })} />
        <AutoTextArea value={item.description} minRows={1} placeholder="תיאור (אופציונלי)" ariaLabel="תיאור" onInput={(v) => set({ description: v })} />
      </div>
      <div class="catalog-row__side">
        <NumberInput ariaLabel="מחיר" prefix="₪" value={item.price} onCommit={(v) => set({ price: v })} />
        <select
          class="input select select--sm"
          aria-label="קטגוריה"
          value={effectiveCategoryId(item.categoryId, categories)}
          onChange={(e) => set({ categoryId: e.currentTarget.value })}
        >
          {categories.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="icon-btn icon-btn--danger"
          aria-label="מחיקת פריט"
          onClick={() => {
            if (!item.name || confirm(`למחוק את "${item.name}" מהקטלוג?`)) deleteCatalogItem(item.id);
          }}
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

function CategoriesCard({ categories }: { categories: Category[] }) {
  const [name, setName] = useState('');
  const move = (i: number, d: -1 | 1) => {
    const next = categories.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setCategories(next);
  };
  const add = () => {
    const n = name.trim();
    if (!n) return;
    setCategories([...categories, { id: newId(), name: n }]);
    setName('');
  };
  return (
    <details class="card card--collapsible">
      <summary class="card__head">
        <h2 class="card__title">קטגוריות</h2>
        <span class="card__meta">הסדר כאן קובע את סדר הקבוצות בהצעה</span>
      </summary>
      <ul class="category-list">
        {categories.map((c, i) => (
          <li key={c.id}>
            <input
              class="input"
              value={c.name}
              aria-label="שם קטגוריה"
              onInput={(e) => {
                const v = e.currentTarget.value;
                setCategories(categories.map((x) => (x.id === c.id ? { ...x, name: v } : x)));
              }}
            />
            <button type="button" class="icon-btn" aria-label="למעלה" disabled={i === 0} onClick={() => move(i, -1)}>
              <Icon name="up" />
            </button>
            <button type="button" class="icon-btn" aria-label="למטה" disabled={i === categories.length - 1} onClick={() => move(i, 1)}>
              <Icon name="down" />
            </button>
            <button
              type="button"
              class="icon-btn icon-btn--danger"
              aria-label="מחיקת קטגוריה"
              disabled={c.id === OTHER_CATEGORY_ID}
              title={c.id === OTHER_CATEGORY_ID ? 'קטגוריית ברירת המחדל אינה ניתנת למחיקה' : undefined}
              onClick={() => {
                if (confirm(`למחוק את הקטגוריה "${c.name}"? הפריטים בה יעברו ל"שונות".`)) deleteCategory(c.id);
              }}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input class="input" placeholder="קטגוריה חדשה" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button type="submit" class="btn">
          <Icon name="plus" />
          הוספה
        </button>
      </form>
    </details>
  );
}
