import { getAppName, getIconDataURL } from '@renderer/utils/ipc'
import { cropAndPadTransparent } from '@renderer/utils/image'
import { platform } from '@renderer/utils/init'
import { create } from 'zustand'

interface IconsStore {
  icons: Record<string, string>
  appNames: Record<string, string>
  requestIcon: (path: string) => void
  requestAppName: (path: string) => void
}

const ICON_CONCURRENCY = 5
const APP_NAME_CONCURRENCY = 3
const SCHEDULE_DELAY_MS = 50

const iconQueue = new Set<string>()
const processingIcons = new Set<string>()
let iconTimer: ReturnType<typeof setTimeout> | null = null

const appNameQueue = new Set<string>()
const processingAppNames = new Set<string>()
let appNameTimer: ReturnType<typeof setTimeout> | null = null

export const useIconsStore = create<IconsStore>((set, get) => ({
  icons: {},
  appNames: {},
  requestIcon: (path): void => {
    if (!path) return

    const state = get()
    if (state.icons[path] || processingIcons.has(path) || iconQueue.has(path)) return

    try {
      const cached = localStorage.getItem(path)
      if (cached) {
        set((current) => ({
          icons: {
            ...current.icons,
            [path]: cached
          }
        }))
        return
      }
    } catch {
      // ignore
    }

    iconQueue.add(path)
    scheduleIconProcess()
  },
  requestAppName: (path): void => {
    if (!path) return

    const state = get()
    if (state.appNames[path] || processingAppNames.has(path) || appNameQueue.has(path)) return

    appNameQueue.add(path)
    scheduleAppNameProcess()
  }
}))

const scheduleIconProcess = (): void => {
  if (iconTimer) return

  iconTimer = setTimeout(() => {
    iconTimer = null
    void processIcons()
  }, SCHEDULE_DELAY_MS)
}

const processIcons = async (): Promise<void> => {
  const slots = ICON_CONCURRENCY - processingIcons.size
  if (slots <= 0 || iconQueue.size === 0) return

  const pathsToProcess = Array.from(iconQueue).slice(0, slots)
  pathsToProcess.forEach((path) => iconQueue.delete(path))

  const promises = pathsToProcess.map(async (path) => {
    processingIcons.add(path)
    try {
      const rawBase64 = await getIconDataURL(path)
      if (!rawBase64) return

      const fullDataUrl = rawBase64.startsWith('data:')
        ? rawBase64
        : `data:image/png;base64,${rawBase64}`

      const processedDataUrl =
        platform !== 'darwin' ? await cropAndPadTransparent(fullDataUrl) : fullDataUrl

      try {
        localStorage.setItem(path, processedDataUrl)
      } catch {
        // ignore
      }

      useIconsStore.setState((state) => ({
        icons: {
          ...state.icons,
          [path]: processedDataUrl
        }
      }))
    } catch {
      // ignore
    } finally {
      processingIcons.delete(path)
    }
  })

  await Promise.all(promises)

  if (iconQueue.size > 0) {
    scheduleIconProcess()
  }
}

const scheduleAppNameProcess = (): void => {
  if (appNameTimer) return

  appNameTimer = setTimeout(() => {
    appNameTimer = null
    void processAppNames()
  }, SCHEDULE_DELAY_MS)
}

const processAppNames = async (): Promise<void> => {
  const slots = APP_NAME_CONCURRENCY - processingAppNames.size
  if (slots <= 0 || appNameQueue.size === 0) return

  const pathsToProcess = Array.from(appNameQueue).slice(0, slots)
  pathsToProcess.forEach((path) => appNameQueue.delete(path))

  const promises = pathsToProcess.map(async (path) => {
    processingAppNames.add(path)
    try {
      const appName = await getAppName(path)
      if (appName) {
        useIconsStore.setState((state) => ({
          appNames: {
            ...state.appNames,
            [path]: appName
          }
        }))
      }
    } catch {
      // ignore
    } finally {
      processingAppNames.delete(path)
    }
  })

  await Promise.all(promises)

  if (appNameQueue.size > 0) {
    scheduleAppNameProcess()
  }
}
