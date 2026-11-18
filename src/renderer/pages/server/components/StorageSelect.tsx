// FILE: src/renderer/pages/server/components/StorageSelect.tsx
import { useCallback } from 'react';
import { useT } from '@/i18n';
import { Select } from '@/components/ui';
import { formatMb } from '../utils';
import { CustomMbInput, useCustomMode } from './SizeSelectShared';

const STORAGE_PRESETS_MB = [5120, 10240, 20480, 51200, 102400];
const STORAGE_MIN_MB = 100;

interface Props {
  value: number | null;
  onChange: (mb: number | null) => void;
  onValidChange: (valid: boolean) => void;
}

export default function StorageSelect({ value, onChange, onValidChange }: Props): JSX.Element {
  const t = useT();
  // null (unlimited) counts as a preset
  const isPreset = useCallback((v: number | null) => v === null || STORAGE_PRESETS_MB.includes(v), []);
  const [custom, setCustom] = useCustomMode(value, isPreset);
  const showCustom = custom || !isPreset(value);

  const options = [
    {
      value: 'custom',
      label: showCustom && value !== null ? t('srv.dash.customWithValue', { value: formatMb(value) }) : t('srv.dash.custom')
    },
    { value: 'unlimited', label: t('srv.dash.unlimited') },
    ...STORAGE_PRESETS_MB.map((mb) => ({ value: String(mb), label: formatMb(mb) }))
  ];

  const selected = showCustom ? 'custom' : value === null ? 'unlimited' : String(value);

  return (
    <div>
      <Select
        value={selected}
        options={options}
        onChange={(v) => {
          if (v === 'custom') {
            setCustom(true);
            // start custom editing from a concrete number
            if (value === null) onChange(STORAGE_PRESETS_MB[1]);
          } else if (v === 'unlimited') {
            setCustom(false);
            onValidChange(true);
            onChange(null);
          } else {
            setCustom(false);
            onValidChange(true);
            onChange(Number(v));
          }
        }}
      />
      {showCustom && value !== null ? (
        <CustomMbInput value={value} min={STORAGE_MIN_MB} onChange={(mb) => onChange(mb)} onValidChange={onValidChange} />
      ) : null}
    </div>
  );
}
