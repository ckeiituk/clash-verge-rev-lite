import dayjs from 'dayjs'
import { create } from 'zustand'

const MAX_LOGS = 500

interface LogsStore {
  logs: ControllerLog[]
  clear: () => void
}

export const useLogsStore = create<LogsStore>((set) => ({
  logs: [],
  clear: (): void => set({ logs: [] })
}))

const handleIpcPayload = (log: ControllerLog): void => {
  log.time = dayjs().format('L LTS')
  const previousLogs = useLogsStore.getState().logs
  const nextLogs =
    previousLogs.length >= MAX_LOGS
      ? previousLogs.slice(previousLogs.length - MAX_LOGS + 1).concat(log)
      : previousLogs.concat(log)

  useLogsStore.setState({ logs: nextLogs })
}

let attached = false
let ipcListener: ((event: unknown, payload: ControllerLog) => void) | null = null

export const attachLogsStore = (): (() => void) => {
  if (attached) {
    return (): void => {
      // noop
    }
  }

  attached = true
  ipcListener = (_event, payload): void => {
    handleIpcPayload(payload)
  }
  window.electron.ipcRenderer.on('mihomoLogs', ipcListener)

  return (): void => {
    if (!attached) return

    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('mihomoLogs', ipcListener)
      ipcListener = null
    }

    useLogsStore.setState(
      {
        logs: [],
        clear: useLogsStore.getState().clear
      },
      true
    )
  }
}
