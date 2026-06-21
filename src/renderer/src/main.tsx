import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { init, platform } from '@renderer/utils/init'
import '@renderer/assets/main.css'
import App from '@renderer/App'
import BaseErrorBoundary from './components/base/base-error-boundary'
import { Toaster } from './components/ui/sonner'
import { openDevTools, quitApp, patchAppConfig, getAppConfig } from './utils/ipc'
import { mutate } from 'swr'
import { AppConfigProvider } from './hooks/use-app-config'
import { ControledMihomoConfigProvider } from './hooks/use-controled-mihomo-config'
import { ProfileConfigProvider } from './hooks/use-profile-config'
import { RulesProvider } from './hooks/use-rules'
import { GroupsProvider } from './hooks/use-groups'

let F12Count = 0
let devModeEnabled = false

getAppConfig()
  .then((cfg) => {
    devModeEnabled = !!cfg?.devMode
  })
  .catch(() => {})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__dev = async (enable?: boolean) => {
  const val = enable !== undefined ? enable : true
  await patchAppConfig({ devMode: val })
  await mutate('getConfig')
  devModeEnabled = val
  console.log(`devMode ${val ? 'enabled' : 'disabled'}`)
  return val
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).__help = () => {
  const commands = [
    ['__help()', 'Show this help'],
    ['__dev()', 'Toggle dev mode (enables hidden settings)'],
    ['__dev(false)', 'Disable dev mode'],
    ['__updateBanner()', 'Toggle update banner preview'],
    ['__updateBanner("1.2.0")', 'Show banner with specific version']
  ]
  const maxCmd = Math.max(...commands.map(([c]) => c.length))
  console.log(
    '\n%c OutClash Dev Commands \n',
    'background:#3b82f6;color:white;font-weight:bold;padding:4px 8px;border-radius:4px'
  )
  commands.forEach(([cmd, desc]) => {
    console.log(
      `  %c${cmd.padEnd(maxCmd + 2)}%c${desc}`,
      'color:#3b82f6;font-weight:bold',
      'color:inherit'
    )
  })
  console.log('')
}

init().then(() => {
  document.addEventListener('keydown', (e) => {
    if (platform !== 'darwin' && e.ctrlKey && e.key === 'q') {
      e.preventDefault()
      quitApp()
    }
    if (platform === 'darwin' && e.metaKey && e.key === 'q') {
      e.preventDefault()
      quitApp()
    }
    if (e.key === 'F12') {
      e.preventDefault()
      if (devModeEnabled) {
        openDevTools()
      } else {
        F12Count++
        if (F12Count >= 5) {
          openDevTools()
          F12Count = 0
        }
      }
    }
  })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <NextThemesProvider attribute="class" enableSystem defaultTheme="dark">
      <BaseErrorBoundary>
        <HashRouter>
          <AppConfigProvider>
            <ControledMihomoConfigProvider>
              <ProfileConfigProvider>
                <GroupsProvider>
                  <RulesProvider>
                    <App />
                    <Toaster richColors position="bottom-right" />
                  </RulesProvider>
                </GroupsProvider>
              </ProfileConfigProvider>
            </ControledMihomoConfigProvider>
          </AppConfigProvider>
        </HashRouter>
      </BaseErrorBoundary>
    </NextThemesProvider>
  </React.StrictMode>
)
