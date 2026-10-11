import { app, safeStorage } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { Settings, SummaryType } from '../shared/types'

type StoredSettings = Partial<Omit<Settings, 'gladiaApiKey'>> & {
  gladiaApiKey?: string
  gladiaApiKeyEncrypted?: string
}

const defaultSettings: Settings = {
  gladiaApiKey: process.env.MAIN_VITE_GLADIA_API_KEY ?? '',
  summaryType: 'bullet_points',
  language: 'auto',
  soundEffects: true,
  shortcuts: { launchApp: '', toggleMeeting: '' }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

// On Linux without a keyring Electron falls back to a hardcoded password ("basic_text"), which
// protects nothing, so treat that backend as unavailable and keep the plain value.
function canEncrypt(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform === 'linux') {
    return safeStorage.getSelectedStorageBackend() !== 'basic_text'
  }
  return true
}

function decryptKey(encrypted: string): string {
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    // The keyring changed or was reset; the user has to enter the key again.
    return ''
  }
}

async function writeStored(settings: Settings): Promise<void> {
  const { gladiaApiKey, ...rest } = settings
  const stored: StoredSettings = { ...rest }
  if (gladiaApiKey && canEncrypt()) {
    stored.gladiaApiKeyEncrypted = safeStorage.encryptString(gladiaApiKey).toString('base64')
  } else if (gladiaApiKey) {
    stored.gladiaApiKey = gladiaApiKey
  }
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(stored, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
}

export async function getSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as StoredSettings
    const settings: Settings = {
      gladiaApiKey: parsed.gladiaApiKeyEncrypted
        ? decryptKey(parsed.gladiaApiKeyEncrypted)
        : (parsed.gladiaApiKey ?? defaultSettings.gladiaApiKey),
      summaryType: (parsed.summaryType as SummaryType) ?? defaultSettings.summaryType,
      language: parsed.language ?? defaultSettings.language,
      soundEffects: parsed.soundEffects ?? defaultSettings.soundEffects,
      shortcuts: {
        launchApp: parsed.shortcuts?.launchApp ?? defaultSettings.shortcuts.launchApp,
        toggleMeeting: parsed.shortcuts?.toggleMeeting ?? defaultSettings.shortcuts.toggleMeeting
      }
    }

    // Upgrade a plaintext key written by an older version the first time it is read.
    if (parsed.gladiaApiKey && !parsed.gladiaApiKeyEncrypted && canEncrypt()) {
      await writeStored(settings).catch(() => undefined)
    }
    return settings
  } catch {
    return { ...defaultSettings, shortcuts: { ...defaultSettings.shortcuts } }
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  await writeStored(settings)
  return settings
}
