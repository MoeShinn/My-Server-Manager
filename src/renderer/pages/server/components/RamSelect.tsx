// FILE: src/renderer/pages/server/components/RamSelect.tsx
import { useCallback, useMemo } from 'react';
import { useT } from '@/i18n';
import { Select } from '@/components/ui';
import { formatMb } from '../utils';
import { CustomMbInput, useCustomMode } from './SizeSelectShared';

const RAM_PRESETS_MB = [1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384];
const RAM_MIN_MB = 512;

interface Props {
  value: number;
  totalRamMb: number | null;
  onChange: (mb: number) => void;
  onValidChange: (valid: boolean) => void;
}

export default function RamSelect({ value, totalRamMb, onChange, onValidChange }: Props): JSX.Element {
  const t = useT();
  const presets = useMemo(
    () => RAM_PRESETS_MB.filter((mb) => totalRamMb === null || mb < totalRamMb),
    [totalRamMb]
  );
  const isPreset = useCallback((v: number | null) => v !== null && presets.includes(v), [presets]);
  const [custom, setCustom] = useCustomMode(value, isPreset);
  const showCustom = custom || !isPreset(value);

  const options = [
    {
      value: 'custom',
      label: showCustom ? t('srv.dash.customWithValue', { value: formatMb(value) }) : t('srv.dash.custom')
    },
    ...presets.map((mb) => ({ value: String(mb), label: formatMb(mb) }))
  ];

  return (
    <div>
      <Select
        value={showCustom ? 'custom' : String(value)}
        options={options}
        onChange={(v) => {
          if (v === 'custom') {
            setCustom(true);
          } else {
            setCustom(false);
            onValidChange(true);
            onChange(Number(v));
          }
        }}
      />
      {showCustom ? (
        <CustomMbInput
          value={value}
          min={RAM_MIN_MB}
          max={totalRamMb ?? undefined}
          onChange={onChange}
          onValidChange={onValidChange}
        />
      ) : null}
    </div>
  );
}
