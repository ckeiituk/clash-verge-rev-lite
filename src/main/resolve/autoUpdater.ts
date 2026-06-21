import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios'
import { parseYaml } from '../utils/yaml'
import { app, shell } from 'electron'
import { getRuntimeConfig } from '../core/factory'
import { getAppConfig } from '../config/app'
import { dataDir, exeDir, exePath, isPortable, resourcesFilesDir } from '../utils/dirs'
import { copyFile, rm, writeFile, readFile } from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { setNotQuitDialog, mainWindow } from '..'
import { disableSysProxy } from '../sys/sysproxy'
import { t } from '../utils/i18n'

let downloadCancelToken: CancelTokenSource | null = null

// Compare semver-ish versions (x.y.z with optional -prerelease). Returns true only
// if `candidate` is strictly newer than `current`, so switching alpha→stable never
// prompts a downgrade. Falls back to plain inequality if either side doesn't parse.
function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string): { nums: number[]; pre: string } | null => {
    const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
    return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? '' } : null
  }
  const a = parse(candidate)
  const b = parse(current)
  if (!a || !b) return candidate !== current
  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i]
  }
  if (a.pre === b.pre) return false
  if (a.pre === '') return true // a final release outranks a same-version prerelease
  if (b.pre === '') return false // a prerelease is never newer than the final release
  // both are prereleases of the same x.y.z: compare dot-separated identifiers per
  // semver §11 — numeric identifiers numerically (so alpha.10 > alpha.2 and a feed
  // serving an OLDER alpha.3 over alpha.5 is NOT treated as an update), others lexically.
  const ap = a.pre.split('.')
  const bp = b.pre.split('.')
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    if (ap[i] === undefined) return false // fewer identifiers → lower precedence
    if (bp[i] === undefined) return true // more identifiers → higher precedence
    if (ap[i] === bp[i]) continue
    const an = /^\d+$/.test(ap[i])
    const bn = /^\d+$/.test(bp[i])
    if (an && bn) return Number(ap[i]) > Number(bp[i])
    if (an !== bn) return bn // numeric identifiers rank lower than alphanumeric ones
    return ap[i] > bp[i]
  }
  return false
}

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
  if (isNewerVersion(latest.version, currentVersion)) {
    return latest
  } else {
    return undefined
  }
}

export async function downloadAndInstallUpdate(version: string): Promise<void> {
  const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
  const { updateChannel = 'stable' } = await getAppConfig()
  // Derive the GitHub release tag from the CURRENT channel, not from cached check
  // state: alpha artifacts live at the fixed `alpha` tag, stable at the version tag.
  // This avoids downloading the wrong channel's build if the user toggled channel
  // after the last update check.
  const rawTag = updateChannel === 'alpha' ? 'alpha' : version
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
    mainWindow?.setProgressBar(0)

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
          mainWindow?.setProgressBar(percentCompleted / 100)
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
    mainWindow?.setProgressBar(-1)

    disableSysProxy(false)
    if (file.endsWith('.exe')) {
      spawn(path.join(dataDir(), file), ['/S', '--force-run'], {
        detached: true,
        stdio: 'ignore'
      }).unref()
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
    mainWindow?.setProgressBar(-1)
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
