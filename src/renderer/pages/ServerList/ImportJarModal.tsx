import { RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cleanDescription, stripMcColors } from '@shared/mcText'
import type { ServerConfig, ServerSoftware, VersionEntry } from '@shared/types'
import { api } from '@/api'
import { Badge, Button, Field, Modal, Select, Spinner, TextInput, McTextEditor, useToast } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'
import { SOFTWARE_ORDER } from '@/layout/software'

const GROUP_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#a3e635', '#f87171', '#e879f9']
const MC_VERSION_PATTERN = /^\d+(\.\d+){1,2}$/
const versionKey = (v: VersionEntry): string => `${v.mcVersion}|${v.build ?? ''}`

interface Guess {
  software: ServerSoftware
  mcVersion: string | null
  build: string | null
}

/** Best-effort guess from names like paper-1.21.4-232.jar or purpur-1.21.4-2417.jar. The user can always change it. */
export function guessFromJarName(fileName: string): Guess {
  const lower = fileName.toLowerCase()
  const known: ServerSoftware[] = ['purpur', 'folia', 'leaf', 'paper', 'fabric', 'velocity']
  let software: ServerSoftware = known.find((s) => lower.includes(s)) ?? 'custom'
  if (software === 'custom' && (lower.includes('vanilla') || lower.startsWith('minecraft_server') || lower === 'server.jar')) software = 'vanilla'
  const mcVersion = /(\d+\.\d+(?:\.\d+)?)/.exec(fileName)?.[1] ?? null
  const build = mcVersion ? /[-_](\d{1,5})(?:\.jar)?$/i.exec(fileName.replace(/\.jar$/i, ''))?.[1] ?? null : null
  return { software, mcVersion, build }
}

type VersionsState = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: VersionEntry[] }

interface Props {
  jarPath: string | null
  onClose: () => void
  onImported: (cfg: ServerConfig) => void
}

export function ImportJarModal({ jarPath, onClose, onImported }: Props): JSX.Element {
  const t = useT()
  const toast = useToast()
  const errText = useErrorText()
  const open = jarPath !== null
  const fileName = jarPath ? (jarPath.split(/[\\/]/).pop() ?? jarPath) : ''

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [software, setSoftware] = useState<ServerSoftware>('custom')
  const [guess, setGuess] = useState<Guess | null>(null)
  const [versions, setVersions] = useState<VersionsState>({ status: 'idle' })
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedKey, setSelectedKey] = useState('')
  const [manualMc, setManualMc] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [importing, setImporting] = useState(false)

  // Reset the form whenever a new jar is picked.
  useEffect(() => {
    if (!jarPath) return
    const g = guessFromJarName(fileName)
    setName(fileName.replace(/\.jar$/i, ''))
    setDescription('')
    setSoftware(g.software)
    setGuess(g.software !== 'custom' || g.mcVersion ? g : null)
    setSelectedKey('')
    setManualMc(g.software === 'custom' && g.mcVersion ? g.mcVersion : '')
    setShowErrors(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jarPath])

  // Version list of the chosen software.
  useEffect(() => {
    if (!open || software === 'custom') {
      setVersions({ status: 'idle' })
      return
    }
    let cancelled = false
    setVersions({ status: 'loading' })
    api.content
      .listVersions(software, reloadToken > 0 ? { forceRefresh: true } : {})
      .then((items) => {
        if (cancelled) return
        setVersions({ status: 'ready', items })
        setSelectedKey((prev) => (items.some((i) => versionKey(i) === prev) ? prev : ''))
      })
      .catch(() => {
        if (!cancelled) setVersions({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, software, reloadToken])

  // Pre-select the version found in the file name (only when it exists in the list and nothing is chosen yet).
  useEffect(() => {
    if (versions.status !== 'ready' || selectedKey !== '' || !guess || guess.software !== software || !guess.mcVersion) return
    const hit = versions.items.find((i) => i.mcVersion === guess.mcVersion && i.build === guess.build) ?? versions.items.find((i) => i.mcVersion === guess.mcVersion)
    if (hit) setSelectedKey(versionKey(hit))
  }, [versions, guess, software, selectedKey])

  const versionItems = versions.status === 'ready' ? versions.items : []
  const selectedEntry = versionItems.find((v) => versionKey(v) === selectedKey) ?? null
  const usesManual = software === 'custom' || versions.status === 'error'

  const versionOptions: SelectOption[] = useMemo(() => {
    const groupIndex = new Map<string, number>()
    return versionItems.map((v) => {
      if (!groupIndex.has(v.group)) groupIndex.set(v.group, groupIndex.size)
      const color = GROUP_COLORS[(groupIndex.get(v.group) ?? 0) % GROUP_COLORS.length]
      return {
        value: versionKey(v),
        searchText: `${v.mcVersion} ${v.build ?? ''}`,
        label: (
          <span className="inline-flex items-center gap-2">
            <span style={{ color }}>{v.mcVersion}</span>
            {v.build !== null && <span className="text-muted">({v.build})</span>}
            {!v.stable && <Badge color="warning">{t('create.version.unstable')}</Badge>}
          </span>
        )
      }
    })
  }, [versionItems, t])

  const softwareOptions: SelectOption[] = SOFTWARE_ORDER.map((s) => ({ value: s, label: t(`create.software.${s}`) }))

  const manualTrim = manualMc.trim()
  const manualValid = manualTrim === '' || MC_VERSION_PATTERN.test(manualTrim)
  const errors = {
    name: stripMcColors(name).trim() === '' ? t('create.error.name') : null,
    description: cleanDescription(description) === null ? t('info.error.description') : null,
    version: usesManual ? (manualValid ? null : t('create.error.mcVersion')) : selectedEntry ? null : t('servers.importVersionRequired')
  }
  const hasError = Boolean(errors.name || errors.description || errors.version)

  async function doImport(): Promise<void> {
    setShowErrors(true)
    if (!jarPath || hasError) return
    setImporting(true)
    try {
      const cfg = await api.servers.importJar({
        jarPath,
        name: name.trim(),
        description: description.trim() === '' ? null : (cleanDescription(description) ?? ''),
        software,
        mcVersion: usesManual ? manualTrim || null : (selectedEntry?.mcVersion ?? null),
        build: usesManual ? null : (selectedEntry?.build ?? null)
      })
      toast.success(t('servers.importDone'))
      onImported(cfg)
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('servers.importTitle')}
      width={560}
      onClose={() => (importing ? undefined : onClose())}
      footer={
        <>
          <Button onClick={onClose} disabled={importing}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={importing} onClick={() => void doImport()}>
            {t('servers.importConfirm')}
          </Button>
        </>
      }
    >
      <div className="max-h-[65vh] space-y-4 overflow-auto pr-1">
        <Field label={t('servers.importJarLabel')}>
          <div className="break-all rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted" title={jarPath ?? ''}>
            {jarPath}
          </div>
        </Field>

        <Field label={t('servers.importName')} error={showErrors ? errors.name : null}>
          <McTextEditor value={name} onChange={setName} maxLength={100} invalid={showErrors && !!errors.name} />
        </Field>

        <Field label={t('info.description.label')} error={showErrors ? errors.description : null}>
          <McTextEditor multiline value={description} onChange={setDescription} maxLength={256} placeholder={t('info.description.placeholder')} invalid={showErrors && !!errors.description} />
        </Field>

        <Field label={t('create.software.label')}>
          <Select
            value={software}
            options={softwareOptions}
            onChange={(v) => {
              setSoftware(v as ServerSoftware)
              setSelectedKey('')
            }}
          />
        </Field>

        {usesManual ? (
          <Field
            label={t('servers.importVersion')}
            hint={versions.status === 'error' ? undefined : t('servers.importVersionHint')}
            error={showErrors ? errors.version : null}
          >
            <TextInput value={manualMc} onChange={setManualMc} placeholder="1.21.4" invalid={showErrors && !!errors.version} />
            {versions.status === 'error' && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                <span>{t('servers.importVersionLoadFailed')}</span>
                <Button size="sm" onClick={() => setReloadToken((n) => n + 1)}>
                  {t('common.retry')}
                </Button>
              </div>
            )}
          </Field>
        ) : (
          <Field label={t('servers.importVersionSelect')} error={showErrors ? errors.version : null}>
            <div className="flex items-center gap-2">
              <Select
                className="min-w-0 flex-1"
                searchable
                value={selectedKey}
                options={versionOptions}
                onChange={setSelectedKey}
                disabled={versions.status !== 'ready'}
                invalid={showErrors && !!errors.version}
                placeholder={versions.status === 'loading' ? t('create.version.loading') : t('servers.importVersionPlaceholder')}
              />
              {versions.status === 'loading' && <Spinner />}
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('create.version.refresh')}
                title={t('create.version.refresh')}
                disabled={versions.status === 'loading'}
                icon={<RefreshCw size={15} />}
                onClick={() => setReloadToken((n) => n + 1)}
              />
            </div>
            {guess && guess.software === software && guess.mcVersion && selectedEntry && (
              <p className="text-xs text-muted">{t('servers.importGuessed', { software: t(`create.software.${software}`), version: guess.mcVersion })}</p>
            )}
          </Field>
        )}

        <p className="text-xs text-muted">{t('servers.importCopyNote')}</p>
      </div>
    </Modal>
  )
}
