import React from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useLanguage } from '@renderer/hooks/use-language'

const LanguageConfig: React.FC = () => {
  const { currentLanguage, changeLanguage, languages, t } = useLanguage()

  return (
    <SettingCard>
      <SettingItem title={t('settings.appearance.language')}>
        <Select
          value={currentLanguage}
          onValueChange={(value) => {
            changeLanguage(value as 'zh-CN' | 'en-US' | 'ru-RU')
          }}
        >
          <SelectTrigger data-guide="settings-language-select" size="sm" className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.nativeLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingItem>
    </SettingCard>
  )
}

export default LanguageConfig
