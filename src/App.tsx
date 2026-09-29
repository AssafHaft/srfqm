import { signal } from '@preact/signals';
import { Icon, type IconName } from './components/icons';
import { Toasts } from './components/toast';
import { cloudState } from './cloud/cloud';
import { CLOUD_STATUS } from './views/CloudCard';
import { href, route } from './router';
import { ready, storageAvailable } from './store/store';
import { CatalogView } from './views/CatalogView';
import { QuoteEditor } from './views/QuoteEditor';
import { QuotesList } from './views/QuotesList';
import { RemoteCatalogBanner } from './views/RemoteCatalogBanner';
import { SettingsView } from './views/SettingsView';

/** Set by the service worker when a new version has been downloaded. */
export const updateReady = signal<null | (() => void)>(null);

const NAV: { to: string; label: string; icon: IconName; match: string[] }[] = [
  { to: href.quotes, label: 'הצעות', icon: 'list', match: ['quotes', 'quote'] },
  { to: href.catalog, label: 'קטלוג', icon: 'box', match: ['catalog'] },
  { to: href.settings, label: 'הגדרות', icon: 'sliders', match: ['settings'] },
];

export function App() {
  const r = route.value;
  return (
    <div class={`app app--${r.name}`}>
      <header class="topbar">
        <a class="topbar__brand" href={href.quotes}>
          <img src="./favicon.png" alt="" width="28" height="28" />
          <span>מחולל הצעות מחיר</span>
        </a>
        {cloudState.value !== 'off' && (
          <a
            class={`topbar__cloud cloud-pill cloud-pill--${cloudState.value}`}
            href={href.settings}
            title={`סנכרון: ${CLOUD_STATUS[cloudState.value]}`}
          >
            <Icon name="cloud" size={16} />
            <span>{CLOUD_STATUS[cloudState.value]}</span>
          </a>
        )}
        <nav class="topbar__nav" aria-label="ניווט ראשי">
          {NAV.map((n) => (
            <a key={n.to} href={n.to} class={`topbar__link${n.match.includes(r.name) ? ' is-active' : ''}`}>
              <Icon name={n.icon} size={18} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
      </header>

      {!storageAvailable.value && (
        <div class="banner banner--error">האחסון בדפדפן אינו זמין (ייתכן שמדובר בגלישה פרטית). הנתונים לא יישמרו — שמרו קובץ גיבוי.</div>
      )}
      {updateReady.value && (
        <div class="banner">
          גרסה חדשה של האפליקציה זמינה.
          <button type="button" class="btn btn--sm" onClick={() => updateReady.value?.()}>
            עדכון עכשיו
          </button>
        </div>
      )}

      {ready.value && <RemoteCatalogBanner />}

      <main class="main">
        {!ready.value ? (
          <div class="empty-state">טוען…</div>
        ) : r.name === 'quote' ? (
          <QuoteEditor id={r.id} key={r.id} />
        ) : r.name === 'catalog' ? (
          <CatalogView />
        ) : r.name === 'settings' ? (
          <SettingsView />
        ) : (
          <QuotesList />
        )}
      </main>
      <Toasts />
    </div>
  );
}
