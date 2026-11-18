import type { ReactNode } from 'react';

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

/** One line inside a settings box: label (and optional hint) on the left, the control on the right. */
export default function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-sm text-[var(--text)]">{label}</div>
        {description && <div className="mt-0.5 text-xs text-[var(--muted)]">{description}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}
