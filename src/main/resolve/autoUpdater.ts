import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios'
import { parseYaml } from '../utils/yaml'
import { app, shell } from 'electron'
import { getRuntimeConfig } from '../core/factory'
import { dataDir, exeDir, exePath, isPortable, resourcesFilesDir } from '../utils/dirs'
import { copyFile, rm, writeFile, readFile } from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { setNotQuitDialog, mainWindow } from '..'
import { disableSysProxy } from '../sys/sysproxy'
import { stopCore } from '../core/manager'
import { t } from '../utils/i18n'
import { getAppConfig } from '../config/app'

let downloadCancelToken: CancelTokenSource | null = null
let lastCheckedUpdate: AppVersion | undefined

export async function checkUpdate(): Promise<AppVersion | undefined> {
  const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
  const { updateChannel = 'stable' } = await getAppConfig()
  const url =
    updateChannel === 'alpha'
      ? 'https://github.com/ckeiituk/outclash/releases/download/alpha/alpha.yml'
      : 'https://github.com/ckeiituk/outclash/releases/latest/download/latest.yml'
  const res = await axios.get(url, {
    headers: { 'Content-Type': 'application/octet-stream' },
    ...(mixedPort != 0 && {
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: mixedPort
      }
    }),
    responseType: 'text'
  })
  const latest = parseYaml<AppVersion>(res.data)
  const currentVersion = app.getVersion()
  if (latest.version !== currentVersion) {
    lastCheckedUpdate = latest
    return latest
  } else {
    lastCheckedUpdate = undefined
    return undefined
  }
}

export async function downloadAndInstallUpdate(version: string): Promise<void> {
  const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
  const rawTag = lastCheckedUpdate?.releaseTag ?? version
  const releaseTag = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag
  const baseUrl = `https://github.com/ckeiituk/outclash/releases/download/${releaseTag}/`
  const fileMap = {
    'win32-x64': `OutClash_x64-setup.exe`,
    'win32-arm64': `OutClash_arm64-setup.exe`,
    'darwin-x64': `OutClash_x64.pkg`,
    'darwin-arm64': `OutClash_arm64.pkg`
  }
  let file = fileMap[`${process.platform}-${process.arch}`]
  if (isPortable()) {
    file = file.replace('-setup.exe', '-portable.7z')
  }
  if (!file) {
    throw new Error(t('error.autoUpdateNotSupported'))
  }
  downloadCancelToken = axios.CancelToken.source()

  const apiUrl = `https://api.github.com/repos/ckeiituk/outclash/releases/tags/${releaseTag}`
  const apiRequestConfig: AxiosRequestConfig = {
    headers: { Accept: 'application/vnd.github.v3+json' },
    ...(mixedPort != 0 && {
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: mixedPort
      }
    }),
    cancelToken: downloadCancelToken.token
  }

  try {
    mainWindow?.webContents.send('update-status', {
      downloading: true,
      progress: 0
    })

    const releaseRes = await axios.get(apiUrl, apiRequestConfig)
    const assets: Array<{ name: string; digest?: string }> = releaseRes.data.assets || []
    const matchedAsset = assets.find((a) => a.name === file)
    if (!matchedAsset || !matchedAsset.digest) {
      throw new Error(`${t('error.sha256NotFound')}: "${file}"`)
    }
    const expectedHash = matchedAsset.digest.split(':')[1].toLowerCase()

    if (!existsSync(path.join(dataDir(), file))) {
      const res = await axios.get(`${baseUrl}${file}`, {
        responseType: 'arraybuffer',
        ...(mixedPort != 0 && {
          proxy: {
            protocol: 'http',
            host: '127.0.0.1',
            port: mixedPort
          }
        }),
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        cancelToken: downloadCancelToken.token,
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          )
          mainWindow?.webContents.send('update-status', {
            downloading: true,
            progress: percentCompleted
          })
        }
      })
      await writeFile(path.join(dataDir(), file), res.data)
    }

    const fileBuffer = await readFile(path.join(dataDir(), file))
    const hashSum = createHash('sha256')
    hashSum.update(fileBuffer)
    const localHash = hashSum.digest('hex').toLowerCase()
    if (localHash !== expectedHash) {
      await rm(path.join(dataDir(), file), { force: true })
      throw new Error(
        `${t('error.sha256VerificationFailed')}：${t('error.localHash')} ${localHash} ${t('error.expectedHash')} ${expectedHash} ${t('error.mismatch')}`
      )
    }

    mainWindow?.webContents.send('update-status', {
      downloading: false,
      progress: 100
    })

    disableSysProxy(false)
    if (file.endsWith('.exe')) {
      await stopCore()
      spawn(path.join(dataDir(), file), ['/S', '--force-run'], {
        detached: true,
        stdio: 'ignore'
      }).unref()
      setNotQuitDialog()
      app.quit()
    }
    if (file.endsWith('.7z')) {
      await copyFile(path.join(resourcesFilesDir(), '7za.exe'), path.join(dataDir(), '7za.exe'))
      spawn(
        'cmd',
        [
          '/C',
          `"timeout /t 2 /nobreak >nul && "${path.join(dataDir(), '7za.exe')}" x -o"${exeDir()}" -y "${path.join(dataDir(), file)}" & start "" "${exePath()}""`
        ],
        {
          shell: true,
          detached: true
        }
      ).unref()
      setNotQuitDialog()
      app.quit()
    }
    if (file.endsWith('.pkg')) {
      try {
        const execPromise = promisify(exec)
        const shell = `installer -pkg ${path.join(dataDir(), file).replace(' ', '\\\\ ')} -target /`
        const command = `do shell script "${shell}" with administrator privileges`
        await execPromise(`osascript -e '${command}'`)
        app.relaunch()
        setNotQuitDialog()
        app.quit()
      } catch {
        shell.openPath(path.join(dataDir(), file))
      }
    }
  } catch (e) {
    await rm(path.join(dataDir(), file), { force: true })
    if (axios.isCancel(e)) {
      mainWindow?.webContents.send('update-status', {
        downloading: false,
        progress: 0,
        error: t('error.downloadCancelled')
      })
      return
    } else {
      mainWindow?.webContents.send('update-status', {
        downloading: false,
        progress: 0,
        error: e instanceof Error ? e.message : t('error.downloadFailed')
      })
    }
    throw e
  } finally {
    downloadCancelToken = null
  }
}

export async function cancelUpdate(): Promise<void> {
  if (downloadCancelToken) {
    downloadCancelToken.cancel(t('error.userCancelledDownload'))
    downloadCancelToken = null
  }
}
