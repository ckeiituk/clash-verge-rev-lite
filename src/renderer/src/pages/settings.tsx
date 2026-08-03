import { Button } from '@renderer/components/ui/button'
import BasePage from '@renderer/components/base/base-page'
import GeneralConfig from '@renderer/components/settings/general-config'
import AdvancedSettings from '@renderer/components/settings/advanced-settings'
import Actions from '@renderer/components/settings/actions'
import ShortcutConfig from '@renderer/components/settings/shortcut-config'
import AppearanceConfig from '@renderer/components/settings/appearance-confis'
import LanguageConfig from '@renderer/components/settings/language-config'
import ProxySwitches from '@renderer/components/settings/proxy-switches'
import { useTranslation } from 'react-i18next'
import { Github } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppConfig } from '@renderer/hooks/use-app-config'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig } = useAppConfig()
  const [hiddenToggled, setHiddenToggled] = useState(
    () => sessionStorage.getItem('devMode') === '1'
  )
  // dev mode (__dev) implies the hidden settings without a separate __hidden call
  const showHiddenSettings = hiddenToggled || !!appConfig?.devMode

  const toggleHiddenSettings = (value: boolean): void => {
    setHiddenToggled(value)
    if (value) sessionStorage.setItem('devMode', '1')
    else sessionStorage.removeItem('devMode')
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__hidden = () => toggleHiddenSettings(!hiddenToggled)
  }, [hiddenToggled])

  return (
    <BasePage
      title={t('pages.settings.title')}
      header={
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            className="app-nodrag"
            title={t('pages.settings.githubRepo')}
            onClick={() => {
              window.open('https://github.com/ckeiituk/outclash')
            }}
          >
            <Github className="text-lg" />
          </Button>
        </>
      }
    >
      <ProxySwitches />
      <GeneralConfig showHiddenSettings={showHiddenSettings} />
      <LanguageConfig />
      <AppearanceConfig showHiddenSettings={showHiddenSettings} />
      <AdvancedSettings showHiddenSettings={showHiddenSettings} />
      <ShortcutConfig />
      <Actions
        showHiddenSettings={showHiddenSettings}
        onUnlockHiddenSettings={() => toggleHiddenSettings(true)}
      />
    </BasePage>
  )
}

export default Settings
