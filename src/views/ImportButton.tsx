import { useRef } from 'preact/hooks';
import { Icon } from '../components/icons';
import { toast } from '../components/toast';
import { BackupError, parseBackup } from '../store/backup';
import { importData, quotes } from '../store/store';

/** Loads a full backup or a price-list file chosen by the user. */
export function ImportButton({ label }: { label: string }) {
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      const message =
        data.kind === 'catalog'
          ? `לטעון את המחירון מהקובץ (${data.catalog.items.length} פריטים)? הקטלוג הנוכחי יוחלף.`
          : `לשחזר את הגיבוי? כל הנתונים במכשיר זה (${quotes.value.length} הצעות, קטלוג והגדרות) יוחלפו בתוכן הקובץ (${data.quotes?.length ?? 0} הצעות).`;
      if (!confirm(message)) return;
      await importData(data);
      toast(data.kind === 'catalog' ? 'המחירון נטען' : 'הגיבוי שוחזר');
    } catch (err) {
      toast(err instanceof BackupError ? err.message : 'טעינת הקובץ נכשלה.', 'error');
    }
  };

  return (
    <>
      <button type="button" class="btn" onClick={() => input.current?.click()}>
        <Icon name="upload" />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void onFile(file);
        }}
      />
    </>
  );
}
