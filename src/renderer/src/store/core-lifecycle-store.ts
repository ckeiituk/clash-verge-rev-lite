import { createStore } from './create-store'

interface CoreLifecycleStore {
  startedAt: number
}

export const useCoreLifecycleStore = createStore<CoreLifecycleStore>(() => ({
  startedAt: 0
}))

export const subscribeCoreStarted = (callback: () => void): (() => void) =>
  useCoreLifecycleStore.subscribe((state, previousState) => {
    if (state.startedAt !== previousState.startedAt) {
      callback()
    }
  })

let attached = false
let ipcListener: (() => void) | null = null

export const attachCoreLifecycleStore = (): (() => void) => {
  if (attached) {
    return (): void => {
      // noop
    }
  }

  attached = true
  ipcListener = (): void => {
    useCoreLifecycleStore.setState({ startedAt: Date.now() })
  }
  window.electron.ipcRenderer.on('core-started', ipcListener)

  return (): void => {
    if (!attached) return

    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('core-started', ipcListener)
      ipcListener = null
    }
  }
}
