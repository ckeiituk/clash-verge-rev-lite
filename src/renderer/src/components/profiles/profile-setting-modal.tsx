import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import React, { useState, useEffect, useRef } from 'react'
import SettingItem from '../base/base-setting-item'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { getUserAgent } from '@renderer/utils/ipc'
import debounce from '@renderer/utils/debounce'
import { t } from 'i18next'
import { MessageCircleQuestionMark } from 'lucide-react'

interface Props {
  onClose: () => void
}

const ProfileSettingModal: React.FC<Props> = (props) => {
  const { onClose } = props
  const { appConfig, patchAppConfig } = useAppConfig()

  const { profileDisplayDate = 'update', userAgent, diffWorkDir = false } = appConfig || {}

  const [ua, setUa] = useState(userAgent ?? '')
  const [defaultUserAgent, setDefaultUserAgent] = useState<string>('')
  const userAgentFetched = useRef(false)

  const setUaDebounce = debounce((v: string) => {
    patchAppConfig({ userAgent: v })
  }, 500)

  useEffect(() => {
    if (!userAgentFetched.current) {
      userAgentFetched.current = true
      getUserAgent().then((ua) => {
        setDefaultUserAgent(ua)
      })
    }
  }, [])

  useEffect(() => {
    setUa(userAgent ?? '')
  }, [userAgent])

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flag-emoji" showCloseButton={false}>
        <DialogHeader className="pb-0">
          <DialogTitle>{t('pages.profiles.profileSettings')}</DialogTitle>
        </DialogHeader>
        <div className="py-2 flex flex-col gap-1">
          <SettingItem title={t('profile.showDate')} divider>
            <Tabs
              value={profileDisplayDate}
              onValueChange={async (value) => {
                await patchAppConfig({
                  profileDisplayDate: value as 'expire' | 'update'
                })
              }}
            >
              <TabsList>
                <TabsTrigger value="update">{t('profile.dateUpdated')}</TabsTrigger>
                <TabsTrigger value="expire">{t('profile.dateExpired')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </SettingItem>
          <SettingItem
            title={t('profile.separateWorkDir')}
            actions={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <MessageCircleQuestionMark className="text-lg" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('profile.separateWorkDirHelp')}</TooltipContent>
              </Tooltip>
            }
            divider
          >
            <Switch
              checked={diffWorkDir}
              onCheckedChange={(v) => {
                patchAppConfig({ diffWorkDir: v })
              }}
            />
          </SettingItem>
          <SettingItem title={t('profile.subscriptionUA')} divider>
            <Input
              className="w-[60%] h-8"
              value={ua}
              placeholder={t('profile.defaultUserAgent', { value: defaultUserAgent })}
              onChange={(event) => {
                setUa(event.target.value)
                setUaDebounce(event.target.value)
              }}
            />
          </SettingItem>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="ghost">
              {t('common.close')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ProfileSettingModal
