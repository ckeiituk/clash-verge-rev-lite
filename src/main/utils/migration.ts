import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import { dataDir, logPath } from './dirs'
import { parseYaml } from './yaml'
import { addProfileItem, getProfileConfig, setProfileConfig } from '../config'

const OLD_APP_ID = 'io.github.outclash'
const MIGRATION_DONE_MARKER = '.migration-done'
const MIGRATION_FILE = '.migration-profiles.yaml'
const MIGRATION_ATTEMPTS_FILE = '.migration-attempts'
const MIGRATION_MAX_ATTEMPTS = 3

interface OldPrfItem {
  uid?: string
  type?: string
  name?: string
  url?: string
  desc?: string
  file?: string
  updated?: number
  extra?: {
    upload?: number
    download?: number
    total?: number
    expire?: number
  }
}

interface OldProfiles {
  current?: string
  items?: OldPrfItem[]
}

function getOldConfigDir(): string {
  switch (process.platform) {
    case 'win32':
      return path.join(app.getPath('appData'), OLD_APP_ID)
    case 'darwin':
      return path.join(app.getPath('home'), 'Library', 'Application Support', OLD_APP_ID)
    case 'linux':
      return path.join(
        process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share'),
        OLD_APP_ID
      )
    default:
      return ''
  }
}

function getMigrationMarkerPath(): string {
  return path.join(dataDir(), MIGRATION_DONE_MARKER)
}

function getMigrationFilePath(): string {
  return path.join(dataDir(), MIGRATION_FILE)
}

function getMigrationAttemptsPath(): string {
  return path.join(dataDir(), MIGRATION_ATTEMPTS_FILE)
}

async function readMigrationAttempts(): Promise<number> {
  try {
    const n = parseInt((await readFile(getMigrationAttemptsPath(), 'utf-8')).trim(), 10)
    return Number.isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

async function writeMigrationAttempts(n: number): Promise<void> {
  await writeFile(getMigrationAttemptsPath(), String(n), 'utf-8')
}

function parseOldProfiles(yamlContent: string): OldPrfItem[] {
  const parsed = parseYaml<OldProfiles>(yamlContent)
  if (!parsed?.items || !Array.isArray(parsed.items)) return []

  return parsed.items.filter(
    (item) => item.type === 'remote' && item.url && item.url.trim().length > 0
  )
}

async function log(message: string): Promise<void> {
  try {
    await writeFile(logPath(), `[Migration]: ${message}\n`, { flag: 'a' })
  } catch {
    // ignore
  }
}

export async function migrateFromOldApp(): Promise<void> {
  if (existsSync(getMigrationMarkerPath())) return

  let yamlContent: string | null = null

  // On Windows, NSIS installer may have placed a migration file
  if (process.platform === 'win32') {
    const migrationFile = getMigrationFilePath()
    if (existsSync(migrationFile)) {
      try {
        yamlContent = await readFile(migrationFile, 'utf-8')
        await log('Found NSIS migration file')
      } catch {
        await log('Failed to read NSIS migration file')
      }
    }
  }

  // Fallback / macOS / Linux: read from old config directory
  if (!yamlContent) {
    const oldDir = getOldConfigDir()
    if (!oldDir) {
      await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
      return
    }
    const oldProfilesPath = path.join(oldDir, 'profiles.yaml')
    if (existsSync(oldProfilesPath)) {
      try {
        yamlContent = await readFile(oldProfilesPath, 'utf-8')
        await log(`Found old profiles.yaml at ${oldProfilesPath}`)
      } catch {
        await log(`Failed to read old profiles.yaml at ${oldProfilesPath}`)
      }
    }
  }

  if (!yamlContent) {
    await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
    return
  }

  const remoteProfiles = parseOldProfiles(yamlContent)
  if (remoteProfiles.length === 0) {
    await log('No remote profiles found in old config')
    await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
    return
  }

  await log(`Found ${remoteProfiles.length} remote profile(s) to migrate`)

  const existingIds = new Set(((await getProfileConfig(true)).items || []).map((item) => item.id))

  for (const oldItem of remoteProfiles) {
    try {
      await addProfileItem({
        type: 'remote',
        url: oldItem.url,
        name: oldItem.name || 'Migrated Profile'
      })
      await log(`Migrated profile "${oldItem.name || oldItem.uid}" (${oldItem.url})`)
    } catch (e) {
      // addProfileItem persists the profile *before* it tries to activate it via
      // a hot-reload into the core. On first-run migration the core is not running
      // yet, so that activation throws even though the profile was imported. Treat
      // the persisted config (checked below), not this throw, as the source of
      // truth; genuine failures (e.g. network) never reach the config.
      await log(
        `Profile "${oldItem.name || oldItem.uid}" (${oldItem.url}) reported: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  const profileCfg = await getProfileConfig(true)
  const importedItems = (profileCfg.items || []).filter((item) => !existingIds.has(item.id))

  // Migration runs before the core starts, so addProfileItem could not select any
  // profile. Pick the first imported one so the core boots with a real config
  // instead of a blank default.
  if (importedItems.length > 0 && !profileCfg.current) {
    profileCfg.current = importedItems[0].id
    await setProfileConfig(profileCfg)
    await log(`Selected "${importedItems[0].name}" as the active profile`)
  }

  const presentUrls = new Set(
    (profileCfg.items || []).filter((i) => i.type === 'remote' && i.url).map((i) => i.url)
  )
  const missingCount = remoteProfiles.filter((p) => !presentUrls.has(p.url)).length
  const importedCount = remoteProfiles.length - missingCount
  await log(`Migration complete: ${importedCount}/${remoteProfiles.length} profile(s) imported`)

  // Some profiles couldn't be fetched (e.g. no network at first launch). Don't
  // mark migration done yet — retry on the next few launches so a transient
  // outage doesn't silently drop the user's subscriptions. Bounded so a
  // permanently-dead URL can't make migration retry forever.
  if (missingCount > 0) {
    const attempts = await readMigrationAttempts()
    if (attempts + 1 < MIGRATION_MAX_ATTEMPTS) {
      await writeMigrationAttempts(attempts + 1)
      await log(
        `${missingCount} profile(s) missing — will retry (attempt ${attempts + 1}/${MIGRATION_MAX_ATTEMPTS})`
      )
      return
    }
    await log(
      `${missingCount} profile(s) still missing after ${MIGRATION_MAX_ATTEMPTS} attempts — giving up`
    )
  }

  await writeFile(getMigrationMarkerPath(), new Date().toISOString(), 'utf-8')
}
