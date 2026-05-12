import { Button } from '@renderer/components/ui/button'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import UpdaterModal from './updater-modal'
import { cancelUpdate } from '@renderer/utils/ipc'
import { CircleFadingArrowUp } from 'lucide-react'
import { useUpdaterStore } from '@renderer/store/updater-store'

interface Props {
  iconOnly?: boolean
  latest?: {
    version: string
    changelog: string
  }
}

const UpdaterButton: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const { iconOnly, latest } = props
  const [openModal, setOpenModal] = useState(false)
  const updateStatus = {
    downloading: useUpdaterStore((state) => state.downloading),
    progress: useUpdaterStore((state) => state.progress),
    error: useUpdaterStore((state) => state.error)
  }
  const resetUpdateStatus = useUpdaterStore((state) => state.reset)

  const handleCancelUpdate = async (): Promise<void> => {
    try {
      await cancelUpdate()
      resetUpdateStatus()
    } catch (e) {
      // ignore
    }
  }

  if (!latest) return null

  return (
    <>
      {openModal && (
        <UpdaterModal
          version={latest.version}
          changelog={latest.changelog}
          updateStatus={updateStatus}
          onCancel={handleCancelUpdate}
          onClose={() => {
            setOpenModal(false)
          }}
        />
      )}
      {iconOnly ? (
        <Button
          data-guide="sidebar-updater-button"
          size="icon-lg"
          className="app-nodrag cursor-pointer rounded-md border border-stroke-power-on/50 bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp className="size-5" />
        </Button>
      ) : (
        <Button
          data-guide="sidebar-updater-button"
          className="app-nodrag h-10 w-full rounded-md border border-stroke-power-on/50 bg-gradient-to-br from-gradient-start-power-on/15 to-gradient-end-power-on/15 font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
          onClick={() => {
            setOpenModal(true)
          }}
        >
          <CircleFadingArrowUp />
          <span className="truncate">{t('common.updateAvailable')}</span>
        </Button>
      )}
    </>
  )
}

export default UpdaterButton
