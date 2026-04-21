import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleFadingArrowUp, X } from 'lucide-react'
import UpdaterModal from './updater-modal'
import { cancelUpdate } from '@renderer/utils/ipc'

interface Props {
  version: string
  changelog: string
  onDismiss: () => void
}

const UpdateBanner: React.FC<Props> = ({ version, changelog, onDismiss }) => {
  const { t } = useTranslation()
  const [openModal, setOpenModal] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{
    downloading: boolean
    progress: number
    error?: string
  }>({ downloading: false, progress: 0 })

  React.useEffect(() => {
    const handleUpdateStatus = (
      _: Electron.IpcRendererEvent,
      status: typeof updateStatus
    ): void => {
      setUpdateStatus(status)
    }
    window.electron.ipcRenderer.on('update-status', handleUpdateStatus)
    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('update-status')
    }
  }, [])

  return (
    <>
      {openModal && (
        <UpdaterModal
          version={version}
          changelog={changelog}
          updateStatus={updateStatus}
          onCancel={async () => {
            try {
              await cancelUpdate()
              setUpdateStatus({ downloading: false, progress: 0 })
            } catch {}
          }}
          onClose={() => setOpenModal(false)}
        />
      )}
      <div className="flex items-center justify-center gap-3 bg-primary/95 backdrop-blur-sm px-4 py-1.5 text-primary-foreground text-sm shadow-md rounded-lg">
        <CircleFadingArrowUp className="size-4 shrink-0 animate-pulse" />
        <span>{t('updater.versionReady', { version })}</span>
        <button
          className="rounded-md bg-primary-foreground/20 px-3 py-0.5 text-xs hover:bg-primary-foreground/30 transition-colors"
          onClick={() => setOpenModal(true)}
        >
          {t('updater.updateNow')}
        </button>
        <button
          className="ml-1 rounded-full p-0.5 hover:bg-primary-foreground/20 transition-colors"
          onClick={onDismiss}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </>
  )
}

export default UpdateBanner
