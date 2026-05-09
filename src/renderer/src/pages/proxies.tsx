import { Avatar, AvatarImage } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Spinner } from '@renderer/components/ui/spinner'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import {
  getImageDataURL,
  mihomoChangeProxy,
  mihomoCloseAllConnections,
  mihomoProxyDelay
} from '@renderer/utils/ipc'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { GroupedVirtuoso, GroupedVirtuosoHandle } from 'react-virtuoso'
import ProxyItem from '@renderer/components/proxies/proxy-item'
import ProxySettingModal from '@renderer/components/proxies/proxy-setting-modal'
import { useGroups } from '@renderer/hooks/use-groups'
import CollapseInput from '@renderer/components/base/collapse-input'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsRight,
  ChevronsUpDown,
  Gauge,
  LocateFixed,
  SlidersHorizontal
} from 'lucide-react'

const groupTypeColor: Record<string, string> = {
  Selector: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  URLTest: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Fallback: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  LoadBalance: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  Relay: 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
}

const Proxies: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const fromHome = (location.state as { fromHome?: boolean })?.fromHome ?? false
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { mode = 'rule' } = controledMihomoConfig || {}
  const { groups = [], mutate } = useGroups()
  const { appConfig } = useAppConfig()
  const {
    proxyDisplayLayout = 'double',
    groupDisplayLayout = 'double',
    proxyDisplayOrder = 'default',
    autoCloseConnection = true,
    proxyCols = 'auto',
    delayTestConcurrency = 50,
    expandProxyGroups = false
  } = appConfig || {}
  const [cols, setCols] = useState(1)
  const [isOpen, setIsOpen] = useState<boolean[]>([])
  const [delaying, setDelaying] = useState<boolean[]>([])
  const [searchValue, setSearchValue] = useState<string[]>([])
  const [iconLoadTick, setIconLoadTick] = useState(0)
  const delayingProxiesRef = useRef<Set<string>>(new Set())
  const completedProxiesRef = useRef<Set<string>>(new Set())
  const [delayingTick, setDelayingTick] = useState(0)
  const prevGroupsLengthRef = useRef(0)
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false)
  const fetchingIconsRef = useRef<Set<string>>(new Set())
  const groupsRef = useRef(groups)
  const allProxiesRef = useRef<(ControllerProxiesDetail | ControllerGroupDetail)[][]>([])
  const groupCountsRef = useRef<number[]>([])
  useEffect(() => {
    if (groups.length !== prevGroupsLengthRef.current) {
      prevGroupsLengthRef.current = groups.length
      setIsOpen((prev) => {
        if (prev.length === groups.length) return prev
        const next = Array(groups.length).fill(expandProxyGroups)
        prev.forEach((v, i) => {
          if (i < next.length) next[i] = v
        })
        return next
      })
      setDelaying((prev) => {
        if (prev.length === groups.length) return prev
        const next = Array(groups.length).fill(false)
        prev.forEach((v, i) => {
          if (i < next.length) next[i] = v
        })
        return next
      })
      setSearchValue((prev) => {
        if (prev.length === groups.length) return prev
        const next = Array(groups.length).fill('')
        prev.forEach((v, i) => {
          if (i < next.length) next[i] = v
        })
        return next
      })
    }
  }, [groups.length, expandProxyGroups])

  useEffect(() => {
    groups.forEach((group) => {
      const iconUrl = group.icon
      if (
        iconUrl &&
        iconUrl.startsWith('http') &&
        !localStorage.getItem(iconUrl) &&
        !fetchingIconsRef.current.has(iconUrl)
      ) {
        fetchingIconsRef.current.add(iconUrl)
        getImageDataURL(iconUrl)
          .then((dataURL) => {
            localStorage.setItem(iconUrl, dataURL)
            setIconLoadTick((c) => c + 1)
          })
          .finally(() => {
            fetchingIconsRef.current.delete(iconUrl)
          })
      }
    })
    if (completedProxiesRef.current.size > 0) {
      const completed = completedProxiesRef.current
      completedProxiesRef.current = new Set()
      completed.forEach((name) => delayingProxiesRef.current.delete(name))
      setDelayingTick((c) => c + 1)
    }
  }, [groups])


  const { groupCounts, allProxies } = useMemo(() => {
    const groupCounts: number[] = []
    const allProxies: (ControllerProxiesDetail | ControllerGroupDetail)[][] = []
    groups.forEach((group, index) => {
      if (isOpen[index]) {
        let groupProxies = group.all.filter(
          (proxy) => proxy && includesIgnoreCase(proxy.name, searchValue[index])
        )
        const count = Math.floor(groupProxies.length / cols)
        groupCounts.push(groupProxies.length % cols === 0 ? count : count + 1)
        if (proxyDisplayOrder === 'delay') {
          groupProxies = groupProxies.sort((a, b) => {
            if (a.history.length === 0) return -1
            if (b.history.length === 0) return 1
            if (a.history[a.history.length - 1].delay === 0) return 1
            if (b.history[b.history.length - 1].delay === 0) return -1
            return a.history[a.history.length - 1].delay - b.history[b.history.length - 1].delay
          })
        }
        if (proxyDisplayOrder === 'name') {
          groupProxies = groupProxies.sort((a, b) => a.name.localeCompare(b.name))
        }
        allProxies.push(groupProxies)
      } else {
        groupCounts.push(0)
        allProxies.push([])
      }
    })
    return { groupCounts, allProxies }
  }, [groups, isOpen, proxyDisplayOrder, cols, searchValue])

  groupsRef.current = groups
  allProxiesRef.current = allProxies
  groupCountsRef.current = groupCounts

  const allExpanded = useMemo(() => {
    return groups.length > 0 && isOpen.every(Boolean)
  }, [groups, isOpen])

  const onChangeProxy = useCallback(
    async (group: string, proxy: string): Promise<void> => {
      await mihomoChangeProxy(group, proxy)
      if (autoCloseConnection) {
        await mihomoCloseAllConnections(group)
      }
      mutate()
    },
    [autoCloseConnection, mutate]
  )

  const onProxyDelay = useCallback(
    async (proxy: string, url?: string): Promise<ControllerProxiesDelay> => {
      return await mihomoProxyDelay(proxy, url)
    },
    []
  )

  const mutateThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const throttledMutate = useCallback(() => {
    if (mutateThrottleRef.current) return
    mutateThrottleRef.current = setTimeout(() => {
      mutate()
      mutateThrottleRef.current = null
    }, 500)
  }, [mutate])
  useEffect(() => {
    return () => {
      if (mutateThrottleRef.current) clearTimeout(mutateThrottleRef.current)
    }
  }, [])

  const onGroupDelay = useCallback(
    async (index: number): Promise<void> => {
      if (allProxies[index].length === 0) {
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
      }
      setDelaying((prev) => {
        const newDelaying = [...prev]
        newDelaying[index] = true
        return newDelaying
      })
      allProxies[index].forEach((p) => delayingProxiesRef.current.add(p.name))
      setDelayingTick((c) => c + 1)
      const result: Promise<void>[] = []
      const runningList: Promise<void>[] = []
      for (const proxy of allProxies[index]) {
        const promise = Promise.resolve().then(async () => {
          try {
            await mihomoProxyDelay(proxy.name, groups[index].testUrl)
          } catch {
            // ignore
          } finally {
            completedProxiesRef.current.add(proxy.name)
            throttledMutate()
          }
        })
        result.push(promise)
        const running = promise.then(() => {
          runningList.splice(runningList.indexOf(running), 1)
        })
        runningList.push(running)
        if (runningList.length >= (delayTestConcurrency || 50)) {
          await Promise.race(runningList)
        }
      }
      await Promise.all(result)
      mutate()
      setDelaying((prev) => {
        const newDelaying = [...prev]
        newDelaying[index] = false
        return newDelaying
      })
    },
    [allProxies, groups, delayTestConcurrency, mutate, throttledMutate]
  )

  const calcCols = useCallback((): number => {
    if (window.matchMedia('(min-width: 1536px)').matches) {
      return 5
    } else if (window.matchMedia('(min-width: 1280px)').matches) {
      return 4
    } else if (window.matchMedia('(min-width: 1024px)').matches) {
      return 3
    } else {
      return 2
    }
  }, [])

  const toggleOpen = useCallback((index: number) => {
    setIsOpen((prev) => {
      const newOpen = [...prev]
      newOpen[index] = !prev[index]
      return newOpen
    })
  }, [])

  const toggleAll = useCallback(() => {
    setIsOpen((prev) => {
      const shouldExpand = !prev.every(Boolean)
      return Array(prev.length).fill(shouldExpand)
    })
  }, [])

  const updateSearchValue = useCallback((index: number, value: string) => {
    setSearchValue((prev) => {
      const newSearchValue = [...prev]
      newSearchValue[index] = value
      return newSearchValue
    })
  }, [])

  const scrollToCurrentProxy = useCallback(
    (index: number) => {
      if (!isOpen[index]) {
        setIsOpen((prev) => {
          const newOpen = [...prev]
          newOpen[index] = true
          return newOpen
        })
      }
      let i = 0
      for (let j = 0; j < index; j++) {
        i += groupCounts[j]
      }
      i += Math.floor(
        allProxies[index].findIndex((proxy) => proxy.name === groups[index].now) / cols
      )
      virtuosoRef.current?.scrollToIndex({
        index: Math.floor(i),
        align: 'start'
      })
    },
    [isOpen, groupCounts, allProxies, groups, cols]
  )

  useEffect(() => {
    if (proxyCols !== 'auto') {
      setCols(parseInt(proxyCols))
      return
    }
    setCols(calcCols())
    const handleResize = (): void => {
      setCols(calcCols())
    }
    window.addEventListener('resize', handleResize)
    return (): void => {
      window.removeEventListener('resize', handleResize)
    }
  }, [proxyCols, calcCols])

  const groupContent = useCallback(
    (index: number) => {
      const group = groups[index]
      if (!group) return <div>Never See This</div>

      const typeColorClass =
        groupTypeColor[group.type] || 'bg-muted text-muted-foreground'

      return (
        <div
          className="w-full pb-2 px-2"
        >
          <Card
            data-guide={index === 0 ? 'proxies-first-group' : undefined}
            data-guide-open={index === 0 ? `${isOpen[index]}` : undefined}
            className="w-full backdrop-blur-3xl cursor-pointer py-0 transition-all duration-200 hover:bg-accent/50 hover:shadow-sm"
            role="button"
            tabIndex={0}
            onClick={() => toggleOpen(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggleOpen(index)
              }
            }}
          >
            <CardContent className="w-full px-4 py-3">
              <div className="flex justify-between items-center">
                {/* Left side: icon + name + meta */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {group.icon ? (
                    <Avatar className="bg-transparent rounded-md shrink-0 size-9">
                      <AvatarImage
                        src={
                          group.icon.startsWith('<svg')
                            ? `data:image/svg+xml;utf8,${group.icon}`
                            : localStorage.getItem(group.icon) || group.icon
                        }
                      />
                    </Avatar>
                  ) : null}
                  <div className={`flex ${groupDisplayLayout === 'double' ? 'flex-col gap-0.5' : 'items-center gap-2'} min-w-0`}>
                    <span className="flag-emoji text-sm font-medium truncate leading-tight">
                      {group.name}
                    </span>
                    {groupDisplayLayout !== 'hidden' && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground leading-tight min-w-0">
                        <Badge
                          variant="ghost"
                          className={`text-[10px] px-1.5 py-0 h-4 rounded-md font-medium shrink-0 ${typeColorClass}`}
                        >
                          {group.type}
                        </Badge>
                        <span className="flag-emoji truncate">{group.now}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                    <CollapseInput
                      value={searchValue[index]}
                      onValueChange={(v) => updateSearchValue(index, v)}
                    />
                    <Button
                      title={t('sider.locateCurrentNode')}
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => scrollToCurrentProxy(index)}
                    >
                      <LocateFixed className="text-base" />
                    </Button>
                    <Button
                      title={t('sider.delayTest')}
                      variant="ghost"
                      size="icon-sm"
                      disabled={delaying[index]}
                      aria-busy={delaying[index]}
                      onClick={() => onGroupDelay(index)}
                    >
                      {delaying[index] ? (
                        <Spinner className="size-4" />
                      ) : (
                        <Gauge className="text-base" />
                      )}
                    </Button>
                  </div>
                  <ChevronDown
                    className={`transition-transform duration-200 ml-1 size-5 ${isOpen[index] ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    },
    [
      groups,
      groupCounts,
      isOpen,
      groupDisplayLayout,
      searchValue,
      delaying,
      iconLoadTick,
      toggleOpen,
      updateSearchValue,
      scrollToCurrentProxy,
      onGroupDelay,
      t
    ]
  )

  const itemContent = useCallback(
    (index: number, groupIndex: number) => {
      const currentGroupCounts = groupCountsRef.current
      const currentAllProxies = allProxiesRef.current
      const currentGroups = groupsRef.current
      let innerIndex = index
      currentGroupCounts.slice(0, groupIndex).forEach((count) => {
        innerIndex -= count
      })
      return currentAllProxies[groupIndex] ? (
        <div
          data-guide={groupIndex === 0 ? 'proxies-first-group-row' : undefined}
          style={
            proxyCols !== 'auto'
              ? { gridTemplateColumns: `repeat(${proxyCols}, minmax(0, 1fr))` }
              : {}
          }
          className={`grid ${proxyCols === 'auto' ? 'sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : ''} ${innerIndex === currentGroupCounts[groupIndex] - 1 ? 'pb-2' : ''} gap-2 ${innerIndex === 0 ? '' : 'pt-2'} mx-2`}
        >
          {Array.from({ length: cols }).map((_, i) => {
            const proxy = currentAllProxies[groupIndex][innerIndex * cols + i]
            if (!proxy) return null
            return (
              <ProxyItem
                key={proxy.name}
                mutateProxies={mutate}
                onProxyDelay={onProxyDelay}
                onSelect={onChangeProxy}
                proxy={proxy}
                group={currentGroups[groupIndex]}
                proxyDisplayLayout={proxyDisplayLayout}
                selected={proxy.name === currentGroups[groupIndex]?.now}
                isGroupDelaying={delayingProxiesRef.current.has(proxy.name)}
              />
            )
          })}
        </div>
      ) : (
        <div>Never See This</div>
      )
    },
    [
      proxyCols,
      cols,
      mutate,
      onProxyDelay,
      onChangeProxy,
      proxyDisplayLayout,
      delayingTick
    ]
  )

  return (
    <BasePage
      title={t('pages.proxies.title')}
      showBackButton={fromHome}
      header={
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={allExpanded ? t('pages.proxies.collapseAll') : t('pages.proxies.expandAll')}
            onClick={toggleAll}
          >
            {allExpanded ? (
              <ChevronsDownUp className="text-lg" />
            ) : (
              <ChevronsUpDown className="text-lg" />
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={t('pages.proxies.proxyGroupSettings')}
            onClick={() => setIsSettingModalOpen(true)}
          >
            <SlidersHorizontal className="text-lg" />
          </Button>
        </>
      }
    >
      {isSettingModalOpen && <ProxySettingModal onClose={() => setIsSettingModalOpen(false)} />}
      {mode === 'direct' ? (
        <div className="h-full w-full flex justify-center items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-muted p-6">
              <ChevronsRight className="text-muted-foreground text-5xl" />
            </div>
            <h2 className="text-muted-foreground text-lg font-medium">{t('sider.directMode')}</h2>
          </div>
        </div>
      ) : (
        <div className="h-full">
          <GroupedVirtuoso
            ref={virtuosoRef}
            groupCounts={groupCounts}
            groupContent={groupContent}
            itemContent={itemContent}
          />
        </div>
      )}
    </BasePage>
  )
}

export default Proxies
