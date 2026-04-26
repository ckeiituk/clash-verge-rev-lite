import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import yaml from 'yaml'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Separator } from '@renderer/components/ui/separator'
import { useTranslation } from 'react-i18next'
import { getProfileStr, setProfileStr } from '@renderer/utils/ipc'
import parseUri from '@renderer/utils/uri-parser'
import { ArrowDownToLine, Trash2, Undo2 } from 'lucide-react'
import { Spinner } from '@renderer/components/ui/spinner'

interface Props {
  id: string
  onClose: () => void
}

interface ProxyEntry {
  name: string
  type: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>
}

const EditProxiesModal: React.FC<Props> = ({ id, onClose }) => {
  const { t } = useTranslation()
  const [proxyUri, setProxyUri] = useState('')
  const [proxies, setProxies] = useState<ProxyEntry[]>([])
  const [deletedNames, setDeletedNames] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profileData, setProfileData] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    loadProfile()
  }, [id])

  const loadProfile = async (): Promise<void> => {
    try {
      const str = await getProfileStr(id)
      const parsed = yaml.parse(str) || {}
      setProfileData(parsed)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingProxies = (parsed.proxies || []).map((p: any) => ({
        name: p.name || 'unknown',
        type: p.type || 'unknown',
        raw: p
      }))
      setProxies(existingProxies)
    } catch (e) {
      toast.error(`${e}`)
    }
  }

  const handleParse = (): void => {
    setParseError(null)
    let uris = proxyUri
    try {
      uris = atob(proxyUri)
    } catch {
      // not base64, use as-is
    }

    const lines = uris
      .trim()
      .split('\n')
      .filter((l) => l.trim())
    const parsed: ProxyEntry[] = []
    const errors: string[] = []
    const existingNames = new Set(proxies.map((p) => p.name))

    for (const line of lines) {
      try {
        const proxy = parseUri(line.trim())
        // Deduplicate names
        let name = proxy.name
        let counter = 2
        while (existingNames.has(name)) {
          name = `${proxy.name} ${counter}`
          counter++
        }
        proxy.name = name
        existingNames.add(name)
        parsed.push({ name: proxy.name, type: proxy.type, raw: proxy })
      } catch (err) {
        errors.push(line.trim().substring(0, 40) + '...')
      }
    }

    if (parsed.length > 0) {
      setProxies((prev) => [...prev, ...parsed])
      setProxyUri('')
      toast.success(t('profile.proxiesAdded', { count: parsed.length }))
    }
    if (errors.length > 0) {
      setParseError(t('profile.parseErrors', { count: errors.length }))
    }
  }

  const handleDeleteToggle = (name: string): void => {
    setDeletedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const handleRemoveNew = (name: string): void => {
    setProxies((prev) => prev.filter((p) => p.name !== name))
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const remaining = proxies.filter((p) => !deletedNames.has(p.name))
      const config = { ...(profileData || {}) }
      config.proxies = remaining.map((p) => p.raw)

      // Update proxy-groups to reference new proxies
      if (Array.isArray(config['proxy-groups'])) {
        const proxyNames = new Set(remaining.map((p) => p.name))
        for (const group of config['proxy-groups']) {
          if (Array.isArray(group.proxies)) {
            // Keep special entries (DIRECT, REJECT, other groups) + valid proxy names
            group.proxies = group.proxies.filter(
              (name: string) =>
                proxyNames.has(name) ||
                ['DIRECT', 'REJECT', 'PASS'].includes(name) ||
                config['proxy-groups'].some(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (g: any) => g.name === name
                )
            )
          }
        }
      }

      const yamlStr = yaml.stringify(config)
      await setProfileStr(id, yamlStr)
      toast.success(t('profile.proxiesSaved'))
      onClose()
    } catch (e) {
      toast.error(`${e}`)
    } finally {
      setSaving(false)
    }
  }

  const originalCount = profileData?.proxies?.length ?? 0

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-3xl h-[70vh] flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('profile.editProxies')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex gap-4">
          {/* Left: paste area */}
          <div className="w-2/5 flex flex-col gap-3">
            <Textarea
              className="flex-1 min-h-32 text-xs font-mono resize-none"
              placeholder={t('profile.pasteProxyLinks')}
              value={proxyUri}
              onChange={(e) => setProxyUri(e.target.value)}
            />
            {parseError && <p className="text-xs text-destructive">{parseError}</p>}
            <Button size="sm" onClick={handleParse} disabled={!proxyUri.trim()}>
              <ArrowDownToLine className="size-4 mr-2" />
              {t('profile.addToProfile')}
            </Button>
          </div>

          <Separator orientation="vertical" />

          {/* Right: proxy list */}
          <div className="w-3/5 flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              {t('profile.currentProxies')} ({proxies.length - deletedNames.size})
            </div>
            <div className="flex-1 min-h-0 rounded-md border p-2 overflow-y-auto">
              {proxies.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8">
                  {t('profile.noProxies')}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {proxies.map((proxy, idx) => {
                    const isDeleted = deletedNames.has(proxy.name)
                    const isNew = idx >= originalCount

                    return (
                      <div
                        key={`${proxy.name}-${idx}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/30 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <span className={isDeleted ? 'line-through text-muted-foreground' : ''}>
                            {proxy.name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">{proxy.type}</span>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            isNew ? handleRemoveNew(proxy.name) : handleDeleteToggle(proxy.name)
                          }
                        >
                          {isDeleted ? (
                            <Undo2 className="size-3.5" />
                          ) : (
                            <Trash2 className="size-3.5 text-destructive" />
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <span className="relative inline-flex items-center justify-center">
              {saving && <Spinner className="size-4 absolute" />}
              <span className={saving ? 'invisible' : undefined}>{t('common.save')}</span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditProxiesModal
