import { ChevronDown, ChevronRight, ExternalLink, FileUp, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cleanDescription, stripMcColors } from '@shared/mcText'
import { DEFAULT_PORT, DEFAULT_RAM_MB, DEFAULT_STORAGE_LIMIT_MB, MOD_KIND_BY_SOFTWARE } from '@shared/constants'
import type { CreateServerInput, DownloadProgress, ModKind, ServerSoftware, SystemInfo, VersionEntry } from '@shared/types'
import { api, getErrorCode } from '@/api'
import { Badge, Box, Button, Field, McTextEditor, Modal, ProgressBar, Select, Spinner, TextInput, Toggle, useToast } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import { useErrorText, useT } from '@/i18n'
import { SOFTWARE_ORDER } from '@/layout/software'

const GROUP_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#a3e635', '#f87171', '#e879f9']
const JAVA_CHOICES = [7, 8, 11, 16, 17, 21, 25]
const RAM_LEVELS = [1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384]
const STORAGE_GB_LEVELS = [5, 10, 20, 50, 100]
const MIN_CUSTOM_MB = 512
const MC_VERSION_PATTERN = /^\d+(\.\d+){1,2}$/

const gb = (mb: number): string => (mb / 1024).toFixed(1)
const versionKey = (v: VersionEntry): string => `${v.mcVersion}|${v.build ?? ''}`

function defaultRamKey(totalMb: number): string {
  if (DEFAULT_RAM_MB < totalMb) return String(DEFAULT_RAM_MB)
  const fit = RAM_LEVELS.filter((l) => l < totalMb)
  return fit.length > 0 ? String(fit[fit.length - 1]) : 'custom'
}

type VersionsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: VersionEntry[] }
type ErrorField = 'name' | 'description' | 'version' | 'jar' | 'mc' | 'ram' | 'storage' | 'port' | 'eula'

export default function CreateServer(): JSX.Element {
  const t = useT()
  const toast = useToast()
  const errText = useErrorText()
  const navigate = useNavigate()

  // --- form state ---
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [software, setSoftware] = useState<ServerSoftware>('paper')
  const [versions, setVersions] = useState<VersionsState>({ status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const forceRefreshRef = useRef(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [customJar, setCustomJar] = useState<string | null>(null)
  const [customKind, setCustomKind] = useState<ModKind>('plugin')
  const [customMc, setCustomMc] = useState('')
  const [javaMajor, setJavaMajor] = useState<number | null>(null)
  const [defaultJava, setDefaultJava] = useState<number | null>(null)
  const [ramKey, setRamKey] = useState(String(DEFAULT_RAM_MB))
  const [customRam, setCustomRam] = useState('2048')
  const ramTouched = useRef(false)
  const [storageKey, setStorageKey] = useState(String(DEFAULT_STORAGE_LIMIT_MB))
  const [customStorage, setCustomStorage] = useState('10240')
  const [autoStart, setAutoStart] = useState(false)
  const [autoRestart, setAutoRestart] = useState(false)
  const [portText, setPortText] = useState(String(DEFAULT_PORT))
  const [portFree, setPortFree] = useState<boolean | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [eula, setEula] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [sys, setSys] = useState<SystemInfo | null>(null)

  // --- submit / progress state ---
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const seenTasks = useRef<Map<string, DownloadProgress['state']>>(new Map())
  const firstTaskId = useRef<string | null>(null)
  const cancelRequested = useRef(false)

  const isCustom = software === 'custom'

  // System info (RAM / disk) and suggested port.
  useEffect(() => {
    api.app.getSystemInfo().then(setSys).catch((err) => console.error(err))
    api.servers
      .suggestPort()
      .then((p) => setPortText(String(p)))
      .catch((err) => console.error(err))
  }, [])

  useEffect(() => {
    if (sys && !ramTouched.current) setRamKey(defaultRamKey(sys.totalRamMb))
  }, [sys])

  // Versions list.
  useEffect(() => {
    if (isCustom) return
    let cancelled = false
    setVersions({ status: 'loading' })
    const forceRefresh = forceRefreshRef.current
    forceRefreshRef.current = false
    api.content
      .listVersions(software, forceRefresh ? { forceRefresh: true } : {})
      .then((items) => {
        if (cancelled) return
        setVersions({ status: 'ready', items })
        setSelectedKey((prev) => (items.some((i) => versionKey(i) === prev) ? prev : items[0] ? versionKey(items[0]) : ''))
      })
      .catch((err) => {
        if (!cancelled) setVersions({ status: 'error', message: errText(err) })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [software, reloadToken])

  const versionItems = versions.status === 'ready' ? versions.items : []
  const selectedEntry = versionItems.find((v) => versionKey(v) === selectedKey) ?? null
  const customMcValid = customMc.trim() === '' || MC_VERSION_PATTERN.test(customMc.trim())
  const mcForJava = isCustom ? (customMc.trim() !== '' && customMcValid ? customMc.trim() : null) : selectedEntry?.mcVersion ?? null

  // Default Java for the chosen Minecraft version.
  useEffect(() => {
    if (!mcForJava) {
      setDefaultJava(null)
      return
    }
    let cancelled = false
    api.content
      .getDefaultJava(mcForJava)
      .then((j) => !cancelled && setDefaultJava(j))
      .catch(() => !cancelled && setDefaultJava(null))
    return () => {
      cancelled = true
    }
  }, [mcForJava])

  useEffect(() => {
    if (defaultJava !== null && javaMajor !== null && javaMajor < defaultJava) setJavaMajor(null)
  }, [defaultJava, javaMajor])

  const maxJava = Math.max(...JAVA_CHOICES)
  const effectiveJava = javaMajor ?? defaultJava ?? maxJava

  // Port availability (debounced).
  const portNumber = Number(portText)
  const portValid = Number.isInteger(portNumber) && portNumber >= 1024 && portNumber <= 65535
  useEffect(() => {
    if (!portValid) {
      setPortFree(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      api.servers
        .isPortFree(portNumber)
        .then((free) => !cancelled && setPortFree(free))
        .catch(() => !cancelled && setPortFree(null))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [portNumber, portValid])

  // Download progress for the creation modal.
  useEffect(
    () =>
      api.on('download:progress', (p) => {
        if (!submittingRef.current || !p.taskId.startsWith('create-')) return
        seenTasks.current.set(p.taskId, p.state)
        if (firstTaskId.current === null) firstTaskId.current = p.taskId
        setProgress(p)
        if (cancelRequested.current && p.state === 'running') void api.content.cancelDownload(p.taskId).catch(() => undefined)
      }),
    []
  )

  // --- derived options ---
  const softwareOptions: SelectOption[] = SOFTWARE_ORDER.map((s) => ({ value: s, label: t(`create.software.${s}`) }))

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

  const totalRam = sys?.totalRamMb ?? null
  const ramOptions: SelectOption[] = [
    { value: 'custom', label: t('create.ram.custom') },
    ...RAM_LEVELS.filter((l) => totalRam === null || l < totalRam).map((l) => ({ value: String(l), label: `${gb(l)} GB (${l} MB)` }))
  ]

  const storageOptions: SelectOption[] = [
    { value: 'custom', label: t('create.storage.custom') },
    { value: 'unlimited', label: t('create.storage.unlimited') },
    ...STORAGE_GB_LEVELS.map((g) => ({ value: String(g * 1024), label: `${g} GB` }))
  ]

  const javaChoices = useMemo(() => {
    if (defaultJava === null) return JAVA_CHOICES
    const list = JAVA_CHOICES.filter((j) => j >= defaultJava)
    if (!list.includes(defaultJava)) list.push(defaultJava)
    return list.sort((a, b) => a - b)
  }, [defaultJava])
  const javaOptions: SelectOption[] = javaChoices.map((j) => ({
    value: String(j),
    label: j === (defaultJava ?? maxJava) ? `Java ${j} (${t(defaultJava === null ? 'create.java.recommended' : 'create.java.default')})` : `Java ${j}`
  }))

  // --- numeric values ---
  const ramMb = ramKey === 'custom' ? Number(customRam) : Number(ramKey)
  const storageMb: number | null = storageKey === 'unlimited' ? null : storageKey === 'custom' ? Number(customStorage) : Number(storageKey)
  const freeDisk = sys?.freeDiskMb ?? 0

  // --- validation ---
  const errors = useMemo(() => {
    const e: Partial<Record<ErrorField, string>> = {}
    if (stripMcColors(name).trim() === '') e.name = t('create.error.name')
    if (cleanDescription(description) === null) e.description = t('info.error.description')
    if (isCustom) {
      if (!customJar) e.jar = t('create.error.jar')
      if (!customMcValid) e.mc = t('create.error.mcVersion')
    } else if (!selectedEntry) {
      e.version = t('create.error.version')
    }
    if (ramKey === 'custom') {
      const max = totalRam ?? Number.MAX_SAFE_INTEGER
      if (!Number.isInteger(ramMb) || ramMb < MIN_CUSTOM_MB || ramMb > max) e.ram = t('create.error.ram', { min: MIN_CUSTOM_MB, max: totalRam ?? '?' })
    }
    if (storageKey === 'custom' && (!Number.isInteger(storageMb) || (storageMb ?? 0) < MIN_CUSTOM_MB)) {
      e.storage = t('create.error.storage', { min: MIN_CUSTOM_MB })
    }
    if (!portValid) e.port = t('create.error.port')
    else if (portFree === false) e.port = t('create.error.portInUse', { port: portNumber })
    if (software !== 'velocity' && !eula) e.eula = t('create.error.eula')
    return e
  }, [name, description, isCustom, customJar, customMcValid, selectedEntry, ramKey, ramMb, totalRam, storageKey, storageMb, portValid, portFree, portNumber, software, eula, t])

  const shown = (field: ErrorField): string | null => (showErrors ? errors[field] ?? null : null)
  const eulaOk = software === 'velocity' || eula

  async function pickJar(): Promise<void> {
    try {
      const file = await api.app.pickFile([{ name: 'JAR', extensions: ['jar'] }])
      if (file) setCustomJar(file)
    } catch (err) {
      toast.error(errText(err))
    }
  }

  function jarName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path
  }

  async function submit(): Promise<void> {
    setShowErrors(true)
    const order: ErrorField[] = ['name', 'description', 'version', 'jar', 'mc', 'ram', 'storage', 'port', 'eula']
    const first = order.find((f) => errors[f])
    if (first) {
      if (first === 'port') setAdvancedOpen(true)
      setTimeout(() => document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
      return
    }

    const javaForced = isCustom && mcForJava === null
    const javaOverride = javaForced ? effectiveJava : javaMajor === null || javaMajor === defaultJava ? null : javaMajor
    const input: CreateServerInput = {
      name: name.trim(),
      description: cleanDescription(description) ?? '',
      software,
      modKind: isCustom ? customKind : MOD_KIND_BY_SOFTWARE[software],
      mcVersion: isCustom ? (customMc.trim() || null) : selectedEntry?.mcVersion ?? null,
      build: isCustom ? null : selectedEntry?.build ?? null,
      customJarPath: isCustom ? customJar : null,
      eulaAccepted: eula,
      settings: {
        ramMb,
        storageLimitMb: storageMb,
        autoStart,
        autoRestartOnCrash: autoRestart,
        port: portNumber,
        javaMajorOverride: javaOverride
      }
    }

    seenTasks.current = new Map()
    firstTaskId.current = null
    cancelRequested.current = false
    submittingRef.current = true
    setProgress(null)
    setSubmitting(true)
    try {
      const cfg = await api.servers.create(input)
      navigate(`/server/${cfg.id}`)
    } catch (err) {
      if (getErrorCode(err) !== 'CANCELLED') toast.error(errText(err))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function cancelCreate(): void {
    cancelRequested.current = true
    const running = [...seenTasks.current.entries()].filter(([, s]) => s === 'running').map(([id]) => id)
    const ids = running.length > 0 ? running : firstTaskId.current ? [firstTaskId.current] : []
    for (const id of ids) void api.content.cancelDownload(id).catch(() => undefined)
  }

  const progressValue = progress && progress.totalBytes ? (progress.receivedBytes / progress.totalBytes) * 100 : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold text-fg">{t('create.title')}</h1>

      <Box title={t('create.section.basics')} className="space-y-4">
        <Field id="field-name" label={t('create.name.label')} error={shown('name')}>
          <McTextEditor value={name} onChange={setName} placeholder={t('create.name.placeholder')} invalid={!!shown('name')} maxLength={100} />
        </Field>

        <Field id="field-description" label={t('info.description.label')} error={shown('description')}>
          <McTextEditor multiline value={description} onChange={setDescription} placeholder={t('info.description.placeholder')} invalid={!!shown('description')} maxLength={256} />
        </Field>

        <Field label={t('create.software.label')}>
          <Select
            value={software}
            options={softwareOptions}
            onChange={(v) => {
              setSoftware(v as ServerSoftware)
              setJavaMajor(null)
            }}
          />
        </Field>

        {!isCustom ? (
          <Field id="field-version" label={t('create.version.label')} error={shown('version')}>
            <div className="flex items-center gap-2">
              <Select
                className="min-w-0 flex-1"
                searchable
                value={selectedKey}
                options={versionOptions}
                onChange={setSelectedKey}
                disabled={versions.status !== 'ready'}
                invalid={!!shown('version')}
                placeholder={versions.status === 'loading' ? t('create.version.loading') : ''}
              />
              {versions.status === 'loading' && <Spinner />}
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('create.version.refresh')}
                title={t('create.version.refresh')}
                disabled={versions.status === 'loading'}
                icon={<RefreshCw size={15} />}
                onClick={() => {
                  forceRefreshRef.current = true
                  setReloadToken((n) => n + 1)
                }}
              />
            </div>
            {versions.status === 'error' && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                <span>{versions.message}</span>
                <Button size="sm" onClick={() => setReloadToken((n) => n + 1)}>
                  {t('common.retry')}
                </Button>
              </div>
            )}
          </Field>
        ) : (
          <>
            <Field id="field-jar" label={t('create.custom.jar')} error={shown('jar')}>
              <div className="flex items-center gap-3">
                <Button icon={<FileUp size={15} />} onClick={() => void pickJar()}>
                  {t('create.custom.pickJar')}
                </Button>
                <span className="min-w-0 truncate text-sm text-muted">{customJar ? jarName(customJar) : t('create.custom.noJar')}</span>
              </div>
            </Field>
            <Field label={t('create.custom.kind')}>
              <Select
                value={customKind}
                onChange={(v) => setCustomKind(v as ModKind)}
                options={[
                  { value: 'plugin', label: t('create.custom.kindPlugin') },
                  { value: 'mod', label: t('create.custom.kindMod') },
                  { value: 'none', label: t('create.custom.kindNone') }
                ]}
              />
            </Field>
            <Field id="field-mc" label={t('create.custom.mcVersion')} hint={t('create.custom.mcVersionHint')} error={shown('mc')}>
              <TextInput value={customMc} onChange={setCustomMc} placeholder="1.21.4" invalid={!!shown('mc')} />
            </Field>
          </>
        )}
      </Box>

      <Box title={t('create.section.resources')} className="space-y-4">
        <Field label={t('create.java.label')} hint={isCustom && mcForJava === null ? t('create.java.customHint') : undefined}>
          <Select value={String(effectiveJava)} options={javaOptions} onChange={(v) => setJavaMajor(Number(v))} />
        </Field>

        <Field id="field-ram" label={t('create.ram.label')} error={shown('ram')} hint={totalRam ? t('create.ram.total', { size: gb(totalRam) }) : undefined}>
          <Select
            value={ramKey}
            options={ramOptions}
            onChange={(v) => {
              ramTouched.current = true
              if (v === 'custom' && ramKey !== 'custom') setCustomRam(String(ramMb))
              setRamKey(v)
            }}
            invalid={!!shown('ram')}
          />
          {ramKey === 'custom' && (
            <div className="mt-2 flex items-center gap-3">
              <TextInput className="w-40" type="number" value={customRam} onChange={setCustomRam} invalid={!!shown('ram')} />
              <span className="text-sm text-muted">MB{Number.isFinite(ramMb) && ramMb > 0 ? ` = ${gb(ramMb)} GB` : ''}</span>
            </div>
          )}
        </Field>

        <Field id="field-storage" label={t('create.storage.label')} error={shown('storage')}>
          <Select
            value={storageKey}
            options={storageOptions}
            onChange={(v) => {
              if (v === 'custom' && storageKey !== 'custom') setCustomStorage(storageMb === null ? String(DEFAULT_STORAGE_LIMIT_MB) : String(storageMb))
              setStorageKey(v)
            }}
            invalid={!!shown('storage')}
          />
          {storageKey === 'custom' && (
            <div className="mt-2 flex items-center gap-3">
              <TextInput className="w-40" type="number" value={customStorage} onChange={setCustomStorage} invalid={!!shown('storage')} />
              <span className="text-sm text-muted">MB{Number.isFinite(storageMb) && (storageMb ?? 0) > 0 ? ` = ${gb(storageMb ?? 0)} GB` : ''}</span>
            </div>
          )}
          {freeDisk > 0 && <p className="mt-1.5 text-xs text-muted">{t('create.storage.freeDisk', { size: gb(freeDisk) })}</p>}
          {freeDisk > 0 && storageMb !== null && Number.isFinite(storageMb) && storageMb > freeDisk && (
            <p className="mt-1 text-xs text-warning">{t('create.storage.warnTooBig', { free: gb(freeDisk) })}</p>
          )}
        </Field>
      </Box>

      <Box title={t('create.section.options')} className="space-y-3">
        <Toggle checked={autoStart} onChange={setAutoStart} label={t('create.autoStart')} />
        <Toggle checked={autoRestart} onChange={setAutoRestart} label={t('create.autoRestart')} />

        <div className="border-t border-line pt-3">
          <button type="button" onClick={() => setAdvancedOpen((o) => !o)} className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
            {advancedOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {t('create.advanced')}
          </button>
          {advancedOpen && (
            <Field
              id="field-port"
              className="mt-3"
              label={t('create.port.label')}
              error={shown('port') ?? (portFree === false && portValid ? t('create.error.portInUse', { port: portNumber }) : null)}
              hint={t('create.port.hint')}
            >
              <TextInput className="w-40" type="number" value={portText} onChange={setPortText} invalid={!!shown('port') || portFree === false} />
            </Field>
          )}
        </div>
      </Box>

      <Box className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
          <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>
            {t('create.eula.text')}{' '}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-accent hover:underline"
              onClick={(e) => {
                e.preventDefault()
                void api.app.openExternal('https://aka.ms/MinecraftEULA').catch((err) => toast.error(errText(err)))
              }}
            >
              {t('create.eula.link')}
              <ExternalLink size={12} />
            </button>
            {software === 'velocity' && <span className="ml-1 text-muted">({t('create.eula.optionalVelocity')})</span>}
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate('/servers')}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!eulaOk || submitting} loading={submitting} onClick={() => void submit()}>
            {t('create.submit')}
          </Button>
        </div>
      </Box>

      <Modal
        open={submitting}
        title={t('create.progress.title')}
        dismissible={false}
        onClose={() => undefined}
        footer={
          <Button variant="secondary" onClick={cancelCreate}>
            {t('common.cancel')}
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('create.progress.hint')}</p>
          <ProgressBar value={progressValue} label={progress?.label ?? t('create.progress.preparing')} />
        </div>
      </Modal>
    </div>
  )
}
