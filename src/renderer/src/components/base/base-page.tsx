import { Button } from '@renderer/components/ui/button'
import { platform } from '@renderer/utils/init'
import WindowControls from '@renderer/components/window-controls'
import UpdateBanner from '@renderer/components/updater/update-banner'
import { useUpdateInfo } from '@renderer/hooks/use-update-info'
import React, { forwardRef, useImperativeHandle, useReducer, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

const sidebarPaths = new Set([
  '/home',
  '/profiles',
  '/proxies',
  '/connections',
  '/rules',
  '/logs',
  '/settings'
])
const isMac = platform === 'darwin'

// Persist across BasePage remounts during route changes and reset on app restart.
let dismissedVersion: string | null = sessionStorage.getItem('updateBannerDismissedVersion')

interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showBackButton?: boolean
}

const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const location = useLocation()
  const navigate = useNavigate()
  const isSubPage = !sidebarPaths.has(location.pathname)
  const updateInfo = useUpdateInfo()
  const [, forceUpdate] = useReducer((value: number) => value + 1, 0)

  const bannerVisible = !!updateInfo?.version && updateInfo.version !== dismissedVersion

  const handleBannerDismiss = (): void => {
    if (!updateInfo?.version) return
    sessionStorage.setItem('updateBannerDismissedVersion', updateInfo.version)
    dismissedVersion = updateInfo.version
    forceUpdate()
  }

  React.useEffect(() => {
    const handleResetUpdateBanner = (): void => {
      dismissedVersion = null
      forceUpdate()
    }
    window.addEventListener('resetUpdateBanner', handleResetUpdateBanner)
    return (): void => {
      window.removeEventListener('resetUpdateBanner', handleResetUpdateBanner)
    }
  }, [])

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full flex flex-col overflow-hidden">
      <div className="shrink-0 z-40 h-14.25 w-full">
        <div className="app-drag px-2 pt-3 pb-2 flex justify-between h-14.25">
          <div className="title h-full text-lg leading-8 flex items-center gap-1">
            {(isSubPage || props.showBackButton) && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="app-nodrag"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {props.title}
          </div>
          <div className="header flex gap-1 h-full items-center">
            {props.header}
            {!isMac && <WindowControls />}
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {bannerVisible && (
          <motion.div
            key="update-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden', flexShrink: 0, zIndex: 30 }}
          >
            <div className="pt-2 pb-1 px-2">
              <UpdateBanner
                version={updateInfo.version}
                releaseTag={updateInfo.releaseTag}
                changelog={updateInfo.changelog}
                onDismiss={handleBannerDismiss}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="content grow overflow-y-auto custom-scrollbar">{props.children}</div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
