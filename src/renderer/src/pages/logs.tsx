import BasePage from '@renderer/components/base/base-page'
import LogItem from '@renderer/components/logs/log-item'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useTranslation } from 'react-i18next'
import { useLogsStore } from '@renderer/store/logs-store'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { openLogDir } from '@renderer/utils/ipc'
import { FolderOpen, MapPin, Trash2 } from 'lucide-react'

const Logs: React.FC = () => {
  const { t } = useTranslation()
  const clearLogs = useLogsStore((state) => state.clear)
  const [logs, setLogs] = useState<ControllerLog[]>(() => useLogsStore.getState().logs)
  const [filter, setFilter] = useState('')
  const [trace, setTrace] = useState(true)
  const traceRef = useRef(trace)

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const filteredLogs = useMemo(() => {
    if (filter === '') return logs
    return logs.filter((log) => {
      return includesIgnoreCase(log.payload, filter) || includesIgnoreCase(log.type, filter)
    })
  }, [logs, filter])

  const toggleTrace = useCallback(() => {
    setTrace((prev) => {
      const next = !prev
      traceRef.current = next
      if (next) {
        setLogs([...useLogsStore.getState().logs])
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!trace) return
    virtuosoRef.current?.scrollToIndex({
      index: filteredLogs.length - 1,
      behavior: 'smooth',
      align: 'end',
      offset: 0
    })
  }, [filteredLogs, trace])

  useEffect(() => {
    return useLogsStore.subscribe((state) => {
      if (traceRef.current) {
        setLogs([...state.logs])
      }
    })
  }, [])

  return (
    <BasePage title={t('pages.logs.title')}>
      <div className="flex flex-col h-full">
        <div className="shrink-0 sticky top-0 z-40">
          <div className="w-full flex px-2 pb-2">
            <Input
              className="h-8 text-sm"
              value={filter}
              placeholder={t('common.filter')}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Button
              size="icon-sm"
              className={cn(
                'ml-2 p-0 bg-clip-border',
                trace && 'bg-primary text-primary-foreground'
              )}
              variant={trace ? 'default' : 'outline'}
              title={t('pages.logs.autoScroll')}
              onClick={toggleTrace}
            >
              <MapPin className="text-lg" />
            </Button>
            <Button
              size="icon-sm"
              title={t('pages.logs.openLogDir')}
              className="ml-2 p-0 bg-clip-border"
              variant="outline"
              onClick={() => openLogDir()}
            >
              <FolderOpen className="text-lg" />
            </Button>
            <Button
              size="icon-sm"
              title={t('pages.logs.clearLogs')}
              className="ml-2 p-0 bg-clip-border"
              variant="ghost"
              onClick={() => {
                clearLogs()
                setLogs([])
              }}
            >
              <Trash2 className="text-lg text-destructive" />
            </Button>
          </div>
          <Separator className="mx-2" />
        </div>
        <div className="flex-1 min-h-0 mt-px">
          <Virtuoso
            ref={virtuosoRef}
            data={filteredLogs}
            initialTopMostItemIndex={filteredLogs.length - 1}
            followOutput={trace}
            itemContent={(i, log) => {
              return (
                <LogItem
                  index={i}
                  key={log.payload + i}
                  time={log.time}
                  type={log.type}
                  payload={log.payload}
                />
              )
            }}
          />
        </div>
      </div>
    </BasePage>
  )
}

export default Logs
