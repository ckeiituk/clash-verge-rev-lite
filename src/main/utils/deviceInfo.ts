import crypto from 'crypto'
import os from 'os'
import { execSync } from 'child_process'

let cachedHWID: string | null = null
let cachedDeviceOS: string | null = null
let cachedOSVersion: string | null = null
let cachedDeviceModel: string | null = null

function execCommand(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: 3000 }).trim()
  } catch {
    return ''
  }
}

export function getHWID(): string {
  if (cachedHWID) return cachedHWID

  const platform = os.platform()
  let raw = ''

  try {
    switch (platform) {
      case 'darwin':
        raw = execCommand('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID')
        raw = raw.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] || ''
        break
      case 'win32':
        raw = execCommand(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid 2>nul'
        )
        raw = raw.match(/MachineGuid\s+REG_SZ\s+(.+)/)?.[1]?.trim() || ''
        break
      case 'linux':
        raw = execCommand(
          'cat /etc/machine-id 2>/dev/null || cat /var/lib/dbus/machine-id 2>/dev/null'
        )
        break
    }
  } catch {
    // fallback below
  }

  if (!raw) {
    const interfaces = os.networkInterfaces()
    const macs = Object.values(interfaces)
      .flat()
      .filter((i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map((i) => i!.mac)
      .sort()
    raw = macs.join(':') + os.hostname() + os.cpus()[0]?.model
  }

  cachedHWID = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16)
  return cachedHWID
}

export function getDeviceOS(): string {
  if (cachedDeviceOS) return cachedDeviceOS

  const platform = os.platform()
  switch (platform) {
    case 'darwin':
      cachedDeviceOS = 'macOS'
      break
    case 'win32':
      cachedDeviceOS = 'Windows'
      break
    case 'linux':
      cachedDeviceOS = 'Linux'
      break
    default:
      cachedDeviceOS = platform
  }
  return cachedDeviceOS
}

export function getOSVersion(): string {
  if (cachedOSVersion) return cachedOSVersion

  const platform = os.platform()

  try {
    switch (platform) {
      case 'darwin': {
        const version = execCommand('sw_vers -productVersion')
        cachedOSVersion = version || os.release()
        break
      }
      case 'win32': {
        const release = os.release()
        const buildMatch = release.match(/(\d+)$/)
        const build = buildMatch ? parseInt(buildMatch[1]) : 0

        let displayVersion = execCommand(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v DisplayVersion 2>nul'
        )
        displayVersion = displayVersion.match(/DisplayVersion\s+REG_SZ\s+(.+)/)?.[1]?.trim() || ''

        if (displayVersion) {
          cachedOSVersion = displayVersion
        } else if (build >= 22000) {
          cachedOSVersion = release
        } else {
          cachedOSVersion = release
        }
        break
      }
      case 'linux': {
        const osRelease = execCommand('cat /etc/os-release 2>/dev/null')
        const distroName = osRelease.match(/^NAME="?([^"\n]+)"?/m)?.[1] || ''
        const versionId = osRelease.match(/^VERSION_ID="?([^"\n]+)"?/m)?.[1] || ''

        if (distroName && versionId) {
          cachedOSVersion = `${distroName} ${versionId}`
        } else if (distroName) {
          cachedOSVersion = distroName
        } else {
          cachedOSVersion = os.release()
        }
        break
      }
      default:
        cachedOSVersion = os.release()
    }
  } catch {
    cachedOSVersion = os.release()
  }

  return cachedOSVersion
}

export function getDeviceModel(): string {
  if (cachedDeviceModel) return cachedDeviceModel

  const platform = os.platform()

  try {
    switch (platform) {
      case 'darwin': {
        const model = execCommand('sysctl -n hw.model')
        if (model) {
          const brandString = execCommand('sysctl -n machdep.cpu.brand_string')
          const chipMatch = brandString.match(/Apple\s+(M\d+\s*\w*)/i)
          if (chipMatch) {
            cachedDeviceModel = `${model} (${chipMatch[1].trim()})`
          } else {
            cachedDeviceModel = model
          }
        } else {
          cachedDeviceModel = 'Mac'
        }
        break
      }
      case 'win32': {
        const caption = execCommand(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v ProductName 2>nul'
        )
        const productName = caption.match(/ProductName\s+REG_SZ\s+(.+)/)?.[1]?.trim()

        if (productName) {
          const build = parseInt(os.release().split('.').pop() || '0')
          if (build >= 22000 && productName.includes('Windows 10')) {
            cachedDeviceModel = productName.replace('Windows 10', 'Windows 11')
          } else {
            cachedDeviceModel = productName
          }
        } else {
          cachedDeviceModel = `Windows ${os.release()}`
        }
        break
      }
      case 'linux': {
        const osRelease = execCommand('cat /etc/os-release 2>/dev/null')
        const prettyName = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1]
        const name = osRelease.match(/^NAME="?([^"\n]+)"?/m)?.[1]
        cachedDeviceModel = prettyName || name || 'Linux'
        break
      }
      default:
        cachedDeviceModel = os.platform()
    }
  } catch {
    cachedDeviceModel = os.platform()
  }

  return cachedDeviceModel
}
