import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { parseNumber } from '../lib/money';

let fieldSeq = 0;
const useFieldId = () => useRef(`f${++fieldSeq}`).current;

export function Field({ label, hint, children, id }: { label: string; hint?: ComponentChildren; children: ComponentChildren; id?: string }) {
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {label}
      </label>
      {children}
      {hint && <div class="field__hint">{hint}</div>}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  hint?: ComponentChildren;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email' | 'date';
  dir?: 'ltr' | 'rtl' | 'auto';
}

export function TextField({ label, value, onInput, hint, placeholder, type = 'text', dir }: TextProps) {
  const id = useFieldId();
  return (
    <Field label={label} hint={hint} id={id}>
      <input
        id={id}
        class="input"
        type={type}
        value={value}
        placeholder={placeholder}
        dir={dir}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </Field>
  );
}

/** Textarea that grows with its content. */
export function AutoTextArea({
  value,
  onInput,
  placeholder,
  id,
  minRows = 2,
  class: cls = '',
  ariaLabel,
}: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  id?: string;
  minRows?: number;
  class?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      class={`input textarea ${cls}`}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onInput={(e) => onInput(e.currentTarget.value)}
    />
  );
}

export function TextAreaField({ label, value, onInput, hint, placeholder, minRows }: TextProps & { minRows?: number }) {
  const id = useFieldId();
  return (
    <Field label={label} hint={hint} id={id}>
      <AutoTextArea id={id} value={value} onInput={onInput} placeholder={placeholder} minRows={minRows} />
    </Field>
  );
}

const display = (n: number, decimals: number) =>
  Number.isFinite(n) ? String(Number(n.toFixed(decimals))) : '';

/**
 * Numeric input that keeps the user's raw text while focused (so "12." or "0.0" can be typed)
 * and commits every valid value immediately.
 */
export function NumberInput({
  value,
  onCommit,
  decimals = 2,
  min = 0,
  id,
  ariaLabel,
  prefix,
  suffix,
  class: cls = '',
}: {
  value: number;
  onCommit: (n: number) => void;
  decimals?: number;
  min?: number;
  id?: string;
  ariaLabel?: string;
  prefix?: string;
  suffix?: string;
  class?: string;
}) {
  const [text, setText] = useState(display(value, decimals));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(display(value, decimals));
  }, [value, decimals]);

  return (
    <div class={`num-input ${cls}`}>
      {prefix && <span class="num-input__affix">{prefix}</span>}
      <input
        id={id}
        class="input input--num"
        inputMode="decimal"
        dir="ltr"
        aria-label={ariaLabel}
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          setText(display(value, decimals));
        }}
        onInput={(e) => {
          const raw = e.currentTarget.value;
          setText(raw);
          const n = parseNumber(raw);
          if (Number.isFinite(n) && n >= min) onCommit(Number(n.toFixed(decimals)));
          else if (raw.trim() === '') onCommit(0);
        }}
      />
      {suffix && <span class="num-input__affix">{suffix}</span>}
    </div>
  );
}

export function NumberField({
  label,
  hint,
  ...rest
}: { label: string; hint?: ComponentChildren } & Parameters<typeof NumberInput>[0]) {
  const id = useFieldId();
  return (
    <Field label={label} hint={hint} id={id}>
      <NumberInput id={id} {...rest} />
    </Field>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={`segmented__btn${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
          key={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useFieldId();
  return (
    <Field label={label} id={id}>
      <select id={id} class="input select" value={value} onChange={(e) => onChange(e.currentTarget.value as T)}>
        {options.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
