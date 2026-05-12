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

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const [showHiddenSettings, setShowHiddenSettings] = useState(
    () => sessionStorage.getItem('devMode') === '1'
  )

  const toggleHiddenSettings = (value: boolean): void => {
    setShowHiddenSettings(value)
    if (value) sessionStorage.setItem('devMode', '1')
    else sessionStorage.removeItem('devMode')
  }

  useEffect(() => {
    ;(window as any).__hidden = () => toggleHiddenSettings(!showHiddenSettings)
  }, [showHiddenSettings])

  return (
    <BasePage
      pageKey="settings"
      title={t('pages.settings.title')}
      contentClassName="settings-page"
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
