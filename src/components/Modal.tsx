import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { Icon } from './icons';

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('has-modal');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-modal');
    };
  }, [onClose]);
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div class="modal__head">
          <h2 class="modal__title">{title}</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="סגירה">
            <Icon name="close" />
          </button>
        </div>
        <div class="modal__body">{children}</div>
        {footer && <div class="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
