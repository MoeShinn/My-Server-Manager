// FILE: src/renderer/pages/server/components/SizeSelectShared.tsx
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { TextInput } from '@/components/ui';
import { mbToGbText } from '../utils';

/**
 * Tracks whether the select is in "custom" mode. Custom mode is entered when the user picks "Custom",
 * or when the value changes from outside to something that is not a preset.
 */
export function useCustomMode(value: number | null, isPreset: (v: number | null) => boolean): [boolean, (v: boolean) => void] {
  const [custom, setCustom] = useState<boolean>(!isPreset(value));
  const lastValue = useRef<number | null>(value);
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      // External change to a non-preset value: switch to custom mode (presets keep the current mode).
      if (!isPreset(value)) setCustom(true);
    }
  }, [value, isPreset]);
  return [custom, setCustom];
}

interface CustomMbInputProps {
  value: number | null;
  min: number;
  max?: number;
  onChange: (mb: number) => void;
  onValidChange: (valid: boolean) => void;
}

/** Number input in MB with a GB hint and range validation. */
export function CustomMbInput({ value, min, max, onChange, onValidChange }: CustomMbInputProps): JSX.Element {
  const t = useT();
  const [text, setText] = useState<string>(value === null ? '' : String(value));
  const emitted = useRef<number | null>(value);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(value === null ? '' : String(value));
    }
  }, [value]);

  const trimmed = text.trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  let errorText: string | null = null;
  if (Number.isNaN(parsed)) errorText = t('srv.dash.sizeInvalid');
  else if (parsed < min) errorText = t('srv.dash.sizeMin', { min });
  else if (max !== undefined && parsed > max) errorText = t('srv.dash.sizeMax', { max });

  useEffect(() => {
    onValidChange(errorText === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorText === null]);

  useEffect(() => {
    return () => onValidChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      <TextInput
        value={text}
        type="number"
        placeholder={t('srv.dash.sizePlaceholder')}
        onChange={(v) => {
          setText(v);
          const tv = v.trim();
          if (/^\d+$/.test(tv)) {
            const n = Number(tv);
            if (n >= min && (max === undefined || n <= max)) {
              emitted.current = n;
              onChange(n);
            }
          }
        }}
      />
      <span style={{ fontSize: 12, color: errorText ? 'var(--danger)' : 'var(--muted)' }}>
        {errorText ?? t('srv.dash.sizeGb', { gb: mbToGbText(parsed) })}
      </span>
    </div>
  );
}
