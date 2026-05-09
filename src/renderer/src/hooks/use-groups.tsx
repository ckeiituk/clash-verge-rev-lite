import React, { createContext, useContext, ReactNode } from 'react'
import useSWR from 'swr'
import { mihomoGroups } from '@renderer/utils/ipc'
import {
  subscribeCoreStarted,
  subscribeProfileReloaded
} from '@renderer/store/core-lifecycle-store'

interface GroupsContextType {
  groups: ControllerMixedGroup[] | undefined
  mutate: () => void
}

const GroupsContext = createContext<GroupsContextType | undefined>(undefined)

export const GroupsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: groups, mutate } = useSWR<ControllerMixedGroup[]>('mihomoGroups', mihomoGroups, {
    errorRetryInterval: 200,
    errorRetryCount: 10,
    keepPreviousData: true,
    dedupingInterval: 300
  })

  React.useEffect(() => {
    const onGroupsUpdated = (): void => {
      mutate()
    }

    window.electron.ipcRenderer.on('groupsUpdated', onGroupsUpdated)
    const unsubscribeCoreStarted = subscribeCoreStarted(() => {
      mutate()
    })
    const unsubscribeProfileReloaded = subscribeProfileReloaded(() => {
      mutate()
    })

    return (): void => {
      window.electron.ipcRenderer.removeListener('groupsUpdated', onGroupsUpdated)
      unsubscribeCoreStarted()
      unsubscribeProfileReloaded()
    }
  }, [mutate])

  return <GroupsContext.Provider value={{ groups, mutate }}>{children}</GroupsContext.Provider>
}

export const useGroups = (): GroupsContextType => {
  const context = useContext(GroupsContext)
  if (context === undefined) {
    throw new Error('useGroups must be used within an GroupsProvider')
  }
  return context
}
