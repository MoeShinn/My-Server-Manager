import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Globe } from 'lucide-react';
import { Box, Button, Select, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import type { AppSettings, LanguageInfo } from '@shared/types';
import LanguageModal from './LanguageModal';
import SettingRow from './SettingRow';
import { readApiError } from './errorUtils';

interface LanguageSectionProps {
  settings: AppSettings;
  onSettingsChange(patch: Partial<AppSettings>): Promise<void>;
}

export default function LanguageSection({ settings, onSettingsChange }: LanguageSectionProps) {
  const t = useT();
  const toast = useToast();
  const [installed, setInstalled] = useState<LanguageInfo[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const showError = useCallback(
    (error: unknown) => {
      const info = readApiError(error);
      toast.error(t('errors.' + info.code, info.params));
    },
    [t, toast],
  );

  const refresh = useCallback(async () => {
    try {
      setInstalled(await window.api.language.listInstalled());
    } catch (error) {
      showError(error);
    }
  }, [showError]);

  useEffect(() => {
    void refresh();
  }, [refresh, settings.language]);

  return (
    <Box title={t('settings.language.title')}>
      <SettingRow label={t('settings.language.label')} description={t('settings.language.description')}>
        <div className="min-w-[200px]">
          <Select
            value={settings.language}
            options={installed.map((l) => ({ value: l.code, label: l.name }))}
            onChange={(value) => void onSettingsChange({ language: value })}
          />
        </div>
      </SettingRow>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="secondary" size="sm" icon={<Globe size={14} />} onClick={() => setModalOpen(true)}>
          {t('settings.language.download')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<FolderOpen size={14} />}
          onClick={() => void window.api.language.openFolder().catch(showError)}
        >
          {t('settings.language.openFolder')}
        </Button>
      </div>
      <LanguageModal open={modalOpen} onClose={() => setModalOpen(false)} onChanged={() => void refresh()} />
    </Box>
  );
}
