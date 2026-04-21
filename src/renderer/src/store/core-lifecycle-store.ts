import { createStore } from './create-store'

interface CoreLifecycleStore {
  startedAt: number
  profileReloadedAt: number
}

export const useCoreLifecycleStore = createStore<CoreLifecycleStore>(() => ({
  startedAt: 0,
  profileReloadedAt: 0
}))

export const subscribeCoreStarted = (callback: () => void): (() => void) =>
  useCoreLifecycleStore.subscribe((state, previousState) => {
    if (state.startedAt !== previousState.startedAt) {
      callback()
    }
  })

export const subscribeProfileReloaded = (callback: () => void): (() => void) =>
  useCoreLifecycleStore.subscribe((state, previousState) => {
    if (state.profileReloadedAt !== previousState.profileReloadedAt) {
      callback()
    }
  })

let attached = false
let coreStartedListener: (() => void) | null = null
let profileReloadedListener: (() => void) | null = null

export const attachCoreLifecycleStore = (): (() => void) => {
  if (attached) {
    return (): void => {
      // noop
    }
  }

  attached = true
  coreStartedListener = (): void => {
    useCoreLifecycleStore.setState({ startedAt: Date.now() })
  }
  profileReloadedListener = (): void => {
    useCoreLifecycleStore.setState({ profileReloadedAt: Date.now() })
  }
  window.electron.ipcRenderer.on('core-started', coreStartedListener)
  window.electron.ipcRenderer.on('profile-reloaded', profileReloadedListener)

  return (): void => {
    if (!attached) return

    attached = false
    if (coreStartedListener) {
      window.electron.ipcRenderer.removeListener('core-started', coreStartedListener)
      coreStartedListener = null
    }
    if (profileReloadedListener) {
      window.electron.ipcRenderer.removeListener('profile-reloaded', profileReloadedListener)
      profileReloadedListener = null
    }
  }
}
