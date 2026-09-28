import { signal } from '@preact/signals';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const toasts = signal<Toast[]>([]);
let seq = 0;

export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  const id = ++seq;
  toasts.value = [...toasts.value, { id, text, tone }];
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 2600);
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div class={`toast toast--${t.tone}`} key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
