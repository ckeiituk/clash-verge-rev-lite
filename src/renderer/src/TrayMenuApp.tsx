import { useEffect, useState, useMemo } from 'react'
import { IoRefresh, IoClose, IoCheckmarkCircle } from 'react-icons/io5'
import { useGroups } from './hooks/use-groups'
import { mihomoChangeProxy, mihomoGroupDelay, mihomoCloseAllConnections } from './utils/ipc'
import { useAppConfig } from './hooks/use-app-config'
import { calcTraffic } from './utils/calc'
import { t } from 'i18next'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@renderer/components/ui/accordion'
import { cn } from '@renderer/lib/utils'

interface TrafficData {
  up: number
  down: number
}

const TrayMenuApp: React.FC = () => {
  const { groups, mutate } = useGroups()
  const { appConfig } = useAppConfig()
  const { autoCloseConnection } = appConfig || {}

  const [traffic, setTraffic] = useState<TrafficData>({ up: 0, down: 0 })
  const [testingGroup, setTestingGroup] = useState<string | null>(null)

  useEffect(() => {
    window.electron.ipcRenderer.on('mihomoTraffic', (_e, info: TrafficData) => {
      setTraffic(info)
    })
    return () => {
      window.electron.ipcRenderer.removeAllListeners('mihomoTraffic')
    }
  }, [])

  const handleClose = (): void => {
    window.electron.ipcRenderer.send('customTray:close')
  }

  const handleRefresh = (): void => {
    mutate()
  }

  const handleTestDelay = async (groupName: string, testUrl?: string): Promise<void> => {
    setTestingGroup(groupName)
    try {
      await mihomoGroupDelay(groupName, testUrl)
      mutate()
    } catch (e) {
      // ignore
    } finally {
      setTestingGroup(null)
    }
  }

  const handleSelectProxy = async (groupName: string, proxyName: string): Promise<void> => {
    try {
      await mihomoChangeProxy(groupName, proxyName)
      if (autoCloseConnection) {
        await mihomoCloseAllConnections()
      }
      mutate()
    } catch (e) {
      // ignore
    }
  }

  const getDelayClassName = (delay: number | undefined): string => {
    if (delay === undefined || delay < 0) return 'bg-muted text-muted-foreground'
    if (delay === 0) return 'bg-destructive/15 text-destructive'
    if (delay <= 150) return 'bg-success/15 text-success'
    if (delay <= 300) return 'bg-warning/15 text-warning'
    return 'bg-destructive/15 text-destructive'
  }

  const formatDelay = (delay: number | undefined): string => {
    if (delay === undefined || delay < 0) return '--'
    if (delay === 0) return 'Timeout'
    return `${delay} ms`
  }

  const getCurrentDelay = (group: ControllerMixedGroup): number | undefined => {
    const current = group.all?.find((p) => p.name === group.now)
    if (!current?.history?.length) return undefined
    return current.history[current.history.length - 1].delay
  }

  const getProxyDelay = (
    proxy: ControllerProxiesDetail | ControllerGroupDetail
  ): number | undefined => {
    if (!proxy.history?.length) return undefined
    return proxy.history[proxy.history.length - 1].delay
  }

  const defaultExpandedKeys = useMemo(() => {
    if (!groups) return []
    return groups.slice(0, 3).map((g) => g.name)
  }, [groups])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden rounded-xl border border-stroke bg-card/50 backdrop-blur-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-stroke">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gradient-end-power-on animate-pulse shadow-lg shadow-gradient-end-power-on/50" />
          <span className="text-sm font-semibold">OutClash</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-xs" variant="ghost" onClick={handleRefresh}>
            <IoRefresh className="text-base" />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={handleClose}>
            <IoClose className="text-base" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-3 py-2 border-b border-stroke">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">↑</span>
          <span className="text-xs font-mono font-medium">{calcTraffic(traffic.up)}/s</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">↓</span>
          <span className="text-xs font-mono font-medium">{calcTraffic(traffic.down)}/s</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!groups || groups.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t('common.noData')}
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={defaultExpandedKeys} className="px-1">
            {groups.map((group) => (
              <AccordionItem key={group.name} value={group.name} className="border-b-0">
                <AccordionTrigger className="py-2 px-2 rounded-lg hover:bg-accent/50 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{group.name}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {group.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-5"
                        disabled={testingGroup === group.name}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTestDelay(group.name, group.testUrl)
                        }}
                      >
                        <IoRefresh
                          className={cn('text-xs', testingGroup === group.name && 'animate-spin')}
                        />
                      </Button>
                      <span
                        className={cn(
                          'inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-medium h-5 min-w-13',
                          getDelayClassName(getCurrentDelay(group))
                        )}
                      >
                        {formatDelay(getCurrentDelay(group))}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <div className="flex flex-col gap-1 pl-2">
                    {group.all?.map((proxy) => {
                      const isActive = proxy.name === group.now
                      const delay = getProxyDelay(proxy)
                      return (
                        <div
                          key={proxy.name}
                          onClick={() => handleSelectProxy(group.name, proxy.name)}
                          className={cn(
                            'flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-150',
                            isActive
                              ? 'bg-linear-to-r from-gradient-start-power-on/15 to-gradient-end-power-on/15 border border-stroke-power-on/30'
                              : 'hover:bg-accent/50'
                          )}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isActive && (
                              <IoCheckmarkCircle className="text-gradient-end-power-on text-sm flex-shrink-0" />
                            )}
                            <span
                              className={cn(
                                'text-xs truncate',
                                isActive && 'text-foreground font-medium'
                              )}
                            >
                              {proxy.name}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-medium h-4 min-w-12 shrink-0',
                              getDelayClassName(delay)
                            )}
                          >
                            {formatDelay(delay)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  )
}

export default TrayMenuApp
