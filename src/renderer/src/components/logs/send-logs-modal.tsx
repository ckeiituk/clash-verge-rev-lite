import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Spinner } from '@renderer/components/ui/spinner'
import { cn } from '@renderer/lib/utils'
import { listLogFiles, uploadLogFiles } from '@renderer/utils/ipc'
import { calcTraffic } from '@renderer/utils/calc'
import { useTranslation } from 'react-i18next'

interface Props {
  onClose: () => void
}

const SendLogsModal: React.FC<Props> = (props) => {
  const { onClose } = props
  const { t } = useTranslation()
  const [files, setFiles] = useState<LogFileInfo[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    listLogFiles()
      .then((list) => {
        setFiles(list)
        setSelected(list.map((file) => file.name))
      })
      .catch((e) => toast.error(`${e}`))
      .finally(() => setLoading(false))
  }, [])

  const allSelected = files.length > 0 && selected.length === files.length

  const toggleFile = (name: string, checked: boolean): void => {
    setSelected(checked ? [...selected, name] : selected.filter((n) => n !== name))
  }

  const onSend = async (): Promise<void> => {
    setSending(true)
    try {
      await uploadLogFiles(selected)
      toast.success(t('logsUpload.success'))
      onClose()
    } catch (e) {
      toast.error(`${t('logsUpload.failed')}: ${e}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={cn('sm:max-w-none', 'w-120')}
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="app-drag">
          <DialogTitle>{t('logsUpload.title')}</DialogTitle>
          <DialogDescription>{t('logsUpload.description')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : files.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('logsUpload.noFiles')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-2">
              <Checkbox
                checked={allSelected ? true : selected.length > 0 ? 'indeterminate' : false}
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? files.map((file) => file.name) : [])
                }
              />
              <span className="flex-1 text-sm font-medium">{t('logsUpload.selectAll')}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {selected.length}/{files.length}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 max-h-[50vh] overflow-y-auto">
              {files.map((file) => (
                <label
                  key={file.name}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(file.name)}
                    onCheckedChange={(checked) => toggleFile(file.name, checked === true)}
                  />
                  <span className="flex-1 truncate text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {dayjs(file.mtime).format('L LT')}
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground whitespace-nowrap">
                    {calcTraffic(file.size)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button size="sm" onClick={onSend} disabled={sending || selected.length === 0}>
            <span className="relative inline-flex items-center justify-center">
              {sending && <Spinner className="size-4 absolute" />}
              <span className={sending ? 'invisible' : undefined}>{t('logsUpload.send')}</span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SendLogsModal
