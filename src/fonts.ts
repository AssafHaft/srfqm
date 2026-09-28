import { signal } from '@preact/signals';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/heebo/700.css';
import '@fontsource/heebo/800.css';

/** Resolves once every Heebo weight used by the document is loaded (Hebrew + Latin subsets), so layout is measured with the final fonts. */
export async function loadDocumentFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  const sample = 'אבג ABC 123 ₪';
  await Promise.all(['400', '500', '700', '800'].map((w) => document.fonts.load(`${w} 16px Heebo`, sample)));
  await document.fonts.ready;
}


/** Bumped whenever fonts finish loading, so the document re-measures with the final metrics. */
export const fontsRevision = signal(0);
export const fontsReady = signal(false);

export function watchFonts(): void {
  void loadDocumentFonts()
    .catch(() => undefined)
    .then(() => {
      fontsReady.value = true;
      fontsRevision.value++;
    });
  if ('fonts' in document) document.fonts.addEventListener('loadingdone', () => fontsRevision.value++);
}
