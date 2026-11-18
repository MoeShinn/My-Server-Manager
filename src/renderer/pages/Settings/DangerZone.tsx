import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Box, Button, ConfirmDialog, Modal, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { readApiError } from './errorUtils';

// No O/0 and I/1 so the code is easy to read and type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => CODE_ALPHABET[v % CODE_ALPHABET.length]).join('');
}

type Step = 'closed' | 'info' | 'confirm';

export default function DangerZone() {
  const t = useT();
  const toast = useToast();
  const [step, setStep] = useState<Step>('closed');
  const [deleteAllData, setDeleteAllData] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  function open() {
    setDeleteAllData(false);
    setCode(randomCode(6));
    setStep('info');
  }

  async function uninstall() {
    setBusy(true);
    try {
      await window.api.app.uninstall({ deleteAllData });
      setStep('closed');
    } catch (error) {
      const info = readApiError(error);
      if (info.code === 'SERVER_RUNNING') toast.error(t('settings.uninstall.serverRunning'));
      else toast.error(t('errors.' + info.code, info.params));
      setStep('closed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box title={t('settings.danger.title')} className="!border-[var(--danger)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-[var(--muted)]">{t('settings.danger.description')}</p>
        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={open}>
          {t('settings.danger.uninstall')}
        </Button>
      </div>

      <Modal
        open={step === 'info'}
        title={t('settings.uninstall.title')}
        onClose={() => setStep('closed')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStep('closed')}>
              {t('settings.cancel')}
            </Button>
            <Button variant="danger" onClick={() => setStep('confirm')}>
              {t('settings.uninstall.continue')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--text)]">{t('settings.uninstall.explain')}</p>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={deleteAllData}
              onChange={(event) => setDeleteAllData(event.target.checked)}
              className="mt-0.5"
              style={{ accentColor: 'var(--danger)' }}
            />
            <span>{t('settings.uninstall.deleteAll')}</span>
          </label>
          {deleteAllData && (
            <div
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
              style={{
                borderColor: 'var(--danger)',
                color: 'var(--danger)',
                background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              }}
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {t('settings.uninstall.deleteAllWarning')}
            </div>
          )}
          <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] py-3">
            <span className="text-xs text-[var(--muted)]">{t('settings.uninstall.codeHint')}</span>
            <span className="select-all font-mono text-3xl font-bold tracking-[0.3em] text-[var(--text)]">{code}</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={step === 'confirm'}
        title={t('settings.uninstall.confirmTitle')}
        message={t('settings.uninstall.confirmMessage', { code })}
        confirmLabel={busy ? t('settings.uninstall.working') : t('settings.uninstall.confirm')}
        danger
        requireText={code}
        onConfirm={() => void uninstall()}
        onCancel={() => setStep('closed')}
      />
    </Box>
  );
}
