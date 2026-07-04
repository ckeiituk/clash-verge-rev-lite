import { readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { app } from 'electron'
import axios from 'axios'
import https from 'https'
import AdmZip from 'adm-zip'
import path from 'path'
import { logDir } from '../utils/dirs'
import { getAppConfig, getCurrentProfileItem } from '../config'
import { getRuntimeConfig } from '../core/factory'
import { getUserAgent } from '../utils/userAgent'
import { getHWID, getDeviceOS, getOSVersion, getDeviceModel } from '../utils/deviceInfo'
import { t } from '../utils/i18n'

let uploading = false

export async function listLogFiles(): Promise<LogFileInfo[]> {
  if (!existsSync(logDir())) return []
  const files = await readdir(logDir())
  const infos = await Promise.all(
    files
      .filter((file) => file.endsWith('.log'))
      .map(async (file) => {
        const st = await stat(path.join(logDir(), file))
        return { name: file, size: st.size, mtime: st.mtimeMs }
      })
  )
  return infos.sort((a, b) => b.mtime - a.mtime)
}

function resolveUploadUrl(candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (!value) continue
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return value
      }
    } catch {
      // ignore invalid url
    }
  }
  return undefined
}

export async function uploadLogFiles(fileNames: string[]): Promise<void> {
  if (uploading) throw new Error('Log upload already in progress')
  uploading = true
  try {
    const profile = await getCurrentProfileItem()
    const { logsUploadUrl: globalUrl } = await getAppConfig()
    const url = resolveUploadUrl([profile?.customLogsUploadUrl, globalUrl, profile?.logsUploadUrl])
    if (!url) throw new Error(t('error.noLogsUploadUrl'))
    const files = fileNames.filter(
      (name) =>
        path.basename(name) === name &&
        name.endsWith('.log') &&
        existsSync(path.join(logDir(), name))
    )
    if (!files.length) throw new Error(t('error.noLogFilesSelected'))
    const zip = new AdmZip()
    for (const file of files) {
      zip.addLocalFile(path.join(logDir(), file))
    }
    const hwid = profile?.customHwid || getHWID()
    const form = new FormData()
    form.append(
      'file',
      new Blob([zip.toBuffer()], { type: 'application/zip' }),
      `outclash-logs-${hwid}-${Date.now()}.zip`
    )
    form.append('hwid', hwid)
    form.append('app_version', app.getVersion())
    form.append('os', getDeviceOS())
    form.append('os_version', getOSVersion())
    form.append('device_model', getDeviceModel())
    form.append('profile_id', profile?.id ?? '')
    form.append('profile_name', profile?.name ?? '')
    form.append('timestamp', new Date().toISOString())
    const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
    try {
      const httpsAgent = new https.Agent()
      await axios.post(url, form, {
        httpsAgent,
        ...(profile?.useProxy &&
          mixedPort && {
            proxy: { protocol: 'http', host: '127.0.0.1', port: mixedPort }
          }),
        headers: {
          'User-Agent': await getUserAgent(),
          'x-hwid': hwid,
          'x-device-os': getDeviceOS(),
          'x-ver-os': getOSVersion(),
          'x-device-model': getDeviceModel()
        },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      })
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
          throw new Error(`${t('error.networkResetOrTimeout')}：${url}`)
        }
        const status = error.response?.status
        throw new Error(
          `${t('error.requestFailed')}：${status ? `${status} ` : ''}${error.message}`
        )
      }
      throw error
    }
  } finally {
    uploading = false
  }
}
