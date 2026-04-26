import { create } from 'zustand'

export interface ConnectionsInfo {
  uploadTotal: number
  downloadTotal: number
  memory: number
}

interface ConnectionsStore {
  active: ControllerConnectionDetail[]
  closed: ControllerConnectionDetail[]
  info: ConnectionsInfo
  isPaused: boolean
  togglePause: () => void
  removeClosedById: (id: string) => void
  clearAllClosed: () => void
}

const MAX_CLOSED = 300

const initialInfo: ConnectionsInfo = {
  uploadTotal: 0,
  downloadTotal: 0,
  memory: 0
}

let previousActiveMap = new Map<string, ControllerConnectionDetail>()

export const useConnectionsStore = create<ConnectionsStore>((set) => ({
  active: [],
  closed: [],
  info: initialInfo,
  isPaused: false,
  togglePause: (): void =>
    set((state) => ({
      isPaused: !state.isPaused
    })),
  removeClosedById: (id): void =>
    set((state) => ({
      closed: state.closed.filter((conn) => conn.id !== id)
    })),
  clearAllClosed: (): void => set({ closed: [] })
}))

const handleIpcPayload = (payload: ControllerConnections): void => {
  const { uploadTotal, downloadTotal, memory } = payload
  const state = useConnectionsStore.getState()
  const prevInfo = state.info

  if (
    prevInfo.uploadTotal !== uploadTotal ||
    prevInfo.downloadTotal !== downloadTotal ||
    prevInfo.memory !== memory
  ) {
    useConnectionsStore.setState({
      info: { uploadTotal, downloadTotal, memory }
    })
  }

  if (state.isPaused) return

  const incoming = payload.connections
  if (!incoming) return

  const currentMap = new Map<string, ControllerConnectionDetail>()

  for (const conn of incoming) {
    if (conn.metadata.type === 'Inner') {
      conn.metadata.process = 'mihomo'
      conn.metadata.processPath = 'mihomo'
    }

    const previous = previousActiveMap.get(conn.id)
    conn.downloadSpeed = previous ? conn.download - previous.download : 0
    conn.uploadSpeed = previous ? conn.upload - previous.upload : 0
    conn.isActive = true

    previousActiveMap.delete(conn.id)
    currentMap.set(conn.id, conn)
  }

  let nextClosed = state.closed

  if (previousActiveMap.size > 0) {
    const newlyClosed: ControllerConnectionDetail[] = []
    for (const conn of previousActiveMap.values()) {
      conn.isActive = false
      conn.downloadSpeed = 0
      conn.uploadSpeed = 0
      newlyClosed.push(conn)
    }

    const mergedClosed = state.closed.concat(newlyClosed)
    nextClosed =
      mergedClosed.length > MAX_CLOSED
        ? mergedClosed.slice(mergedClosed.length - MAX_CLOSED)
        : mergedClosed
  }

  previousActiveMap = currentMap

  useConnectionsStore.setState({
    active: incoming,
    closed: nextClosed
  })
}

let attached = false
let ipcListener: ((event: unknown, payload: ControllerConnections) => void) | null = null

export const attachConnectionsStore = (): (() => void) => {
  if (attached) {
    return (): void => {
      // noop
    }
  }

  attached = true
  ipcListener = (_event, payload): void => {
    handleIpcPayload(payload)
  }
  window.electron.ipcRenderer.on('mihomoConnections', ipcListener)

  return (): void => {
    if (!attached) return

    attached = false
    if (ipcListener) {
      window.electron.ipcRenderer.removeListener('mihomoConnections', ipcListener)
      ipcListener = null
    }

    previousActiveMap = new Map()
    useConnectionsStore.setState(
      {
        active: [],
        closed: [],
        info: initialInfo,
        isPaused: false,
        togglePause: useConnectionsStore.getState().togglePause,
        removeClosedById: useConnectionsStore.getState().removeClosedById,
        clearAllClosed: useConnectionsStore.getState().clearAllClosed
      },
      true
    )
  }
}
