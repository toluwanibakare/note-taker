import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Share } from '@capacitor/share'
import { transcribeBlob } from '../../../shared/gladia-client'
import {
  TRASH_RETENTION_DAYS,
  isMeetingBusy,
  type DeleteResult,
  type Meeting,
  type MeetingStatusEvent,
  type Settings,
  type SummaryType
} from '../../../shared/types'
import type { Api } from '../../../preload/index.d'

// Android version of window.api. The desktop app does this work in Electron's main process; on a
// phone there is no such process, so the same operations run here against app-private storage.

declare const __APP_VERSION__: string

const DIR = Directory.Data
const DAY_MS = 24 * 60 * 60 * 1000

const defaultSettings: Settings = {
  gladiaApiKey: '',
  summaryType: 'bullet_points',
  language: 'auto',
  soundEffects: true,
  shortcuts: { launchApp: '', toggleMeeting: '' }
}

const statusListeners = new Set<(event: MeetingStatusEvent) => void>()
const activeRecordings = new Set<string>()
const appendQueues = new Map<string, Promise<void>>()
let baseUri = ''

const meetingDir = (id: string): string => `meetings/${id}`
const trashDir = (id: string): string => `trash/${id}`
const audioPath = (meeting: Pick<Meeting, 'id' | 'audioExt'>): string =>
  `${meetingDir(meeting.id)}/audio.${meeting.audioExt ?? 'webm'}`

function emitStatus(event: MeetingStatusEvent): void {
  statusListeners.forEach((listener) => listener(event))
}

async function readJson<T>(path: string): Promise<T> {
  const { data } = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 })
  return JSON.parse(typeof data === 'string' ? data : await data.text()) as T
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await Filesystem.writeFile({
    path,
    directory: DIR,
    encoding: Encoding.UTF8,
    recursive: true,
    data: JSON.stringify(value, null, 2)
  })
}

async function listDir(path: string): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path, directory: DIR })
    return files.map((file) => file.name)
  } catch {
    return []
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'))
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
}

async function readMeeting(id: string): Promise<Meeting> {
  return readJson<Meeting>(`${meetingDir(id)}/meeting.json`)
}

async function writeMeeting(meeting: Meeting): Promise<Meeting> {
  await writeJson(`${meetingDir(meeting.id)}/meeting.json`, meeting)
  return meeting
}

async function listMeetings(): Promise<Meeting[]> {
  const meetings: Meeting[] = []
  for (const id of await listDir('meetings')) {
    try {
      meetings.push(await readMeeting(id))
    } catch {
      // skip invalid meeting folders
    }
  }
  return meetings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

async function listTrash(): Promise<Meeting[]> {
  const meetings: Meeting[] = []
  for (const id of await listDir('trash')) {
    try {
      meetings.push(await readJson<Meeting>(`${trashDir(id)}/meeting.json`))
    } catch {
      // skip invalid trash folders
    }
  }
  return meetings.sort(
    (a, b) => new Date(b.deletedAt ?? 0).getTime() - new Date(a.deletedAt ?? 0).getTime()
  )
}

async function removeDir(path: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path, directory: DIR, recursive: true })
  } catch {
    // already gone
  }
}

// Meetings left mid-flight by a crash or a killed app become retryable errors.
async function recoverInterruptedMeetings(): Promise<void> {
  for (const meeting of await listMeetings()) {
    if (!isMeetingBusy(meeting)) continue
    const hasAudio = await Filesystem.stat({ path: audioPath(meeting), directory: DIR })
      .then((info) => info.size > 0)
      .catch(() => false)
    meeting.status = 'error'
    meeting.error = hasAudio
      ? 'This meeting was interrupted before it finished. The audio was saved, so you can retry transcription.'
      : 'This meeting was interrupted before any audio was saved.'
    await writeMeeting(meeting)
  }
}

async function purgeExpiredTrash(): Promise<void> {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * DAY_MS
  for (const meeting of await listTrash()) {
    if (meeting.deletedAt && new Date(meeting.deletedAt).getTime() < cutoff) {
      await removeDir(trashDir(meeting.id))
    }
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*,video/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

async function getSettings(): Promise<Settings> {
  const { value } = await Preferences.get({ key: 'settings' })
  if (!value) return { ...defaultSettings, shortcuts: { ...defaultSettings.shortcuts } }
  try {
    const parsed = JSON.parse(value) as Partial<Settings>
    return {
      ...defaultSettings,
      ...parsed,
      shortcuts: { ...defaultSettings.shortcuts, ...parsed.shortcuts }
    }
  } catch {
    return { ...defaultSettings }
  }
}

function buildApi(): Api {
  return {
    capabilities: {
      systemAudio: false,
      screenRecording: false,
      shortcuts: false,
      nativeShare: true
    },

    mediaUrl: (meeting) => Capacitor.convertFileSrc(`${baseUri}/${audioPath(meeting)}`),

    shareText: async (title, text) => {
      await Share.share({ title, text, dialogTitle: title })
    },

    getSettings,

    saveSettings: async (settings) => {
      await Preferences.set({ key: 'settings', value: JSON.stringify(settings) })
      return { settings }
    },

    startRecording: async () => {
      const id = crypto.randomUUID()
      const meeting: Meeting = {
        id,
        title: `Meeting — ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        durationMs: 0,
        status: 'recording',
        source: 'recording',
        recordingMode: 'audio',
        hasScreenRecording: false,
        audioExt: 'webm'
      }
      await writeMeeting(meeting)
      await Filesystem.writeFile({ path: audioPath(meeting), directory: DIR, data: '' })
      activeRecordings.add(id)
      return meeting
    },

    sendChunk: (id, chunk, kind = 'audio') => {
      if (kind !== 'audio') return
      const path = `${meetingDir(id)}/audio.webm`
      const data = bytesToBase64(chunk)
      // Appends must land in order, so each one waits for the one before it.
      const previous = appendQueues.get(path) ?? Promise.resolve()
      const next = previous
        .then(() => Filesystem.appendFile({ path, directory: DIR, data }))
        .then(() => undefined)
        .catch((error) => console.warn('Dropping audio chunk', error))
      appendQueues.set(path, next)
    },

    stopRecording: async (id, durationMs) => {
      await appendQueues.get(`${meetingDir(id)}/audio.webm`)
      activeRecordings.delete(id)
      const meeting = await readMeeting(id)
      meeting.durationMs = durationMs
      meeting.status = 'uploading'
      return writeMeeting(meeting)
    },

    importAudio: async () => {
      const file = await pickFile()
      if (!file) return null

      const id = crypto.randomUUID()
      const dot = file.name.lastIndexOf('.')
      const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'audio'
      const meeting: Meeting = {
        id,
        title:
          (dot > 0 ? file.name.slice(0, dot) : file.name) ||
          `Upload — ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        durationMs: 0,
        status: 'uploading',
        source: 'upload',
        audioExt: ext
      }
      await Filesystem.writeFile({
        path: audioPath(meeting),
        directory: DIR,
        recursive: true,
        data: await fileToBase64(file)
      })
      await writeMeeting(meeting)
      return meeting
    },

    transcribeMeeting: async (id, requestedSummaryType?: SummaryType) => {
      const settings = await getSettings()
      let meeting = await readMeeting(id)

      if (!settings.gladiaApiKey) {
        meeting.status = 'error'
        meeting.error = 'Gladia API key is not configured.'
        return writeMeeting(meeting)
      }

      const summaryType = requestedSummaryType ?? settings.summaryType
      const previousStatus = meeting.status
      meeting.status = 'uploading'
      meeting.error = undefined
      await writeMeeting(meeting)
      emitStatus({ id, status: 'uploading' })

      try {
        const { data } = await Filesystem.readFile({ path: audioPath(meeting), directory: DIR })
        const blob = typeof data === 'string' ? base64ToBlob(data, '') : data
        const result = await transcribeBlob(
          blob,
          meeting.audioExt ?? 'webm',
          settings.gladiaApiKey,
          { summaryType, language: settings.language },
          (status) =>
            emitStatus({ id, status: status === 'uploading' ? 'uploading' : 'transcribing' })
        )

        meeting = await readMeeting(id)
        meeting.status = 'done'
        meeting.summaries = { ...meeting.summaries, [summaryType]: result.summary }
        meeting.summary = result.summary
        meeting.fullTranscript = result.fullTranscript
        meeting.utterances = result.utterances
        meeting.error = undefined
        await writeMeeting(meeting)
        emitStatus({ id, status: 'done' })
        return meeting
      } catch (error) {
        meeting = await readMeeting(id)
        // A failed extra summary must not hide a transcript that already exists.
        meeting.status = previousStatus === 'done' ? 'done' : 'error'
        meeting.error = error instanceof Error ? error.message : 'Transcription failed'
        await writeMeeting(meeting)
        emitStatus({ id, status: meeting.status })
        return meeting
      }
    },

    listMeetings,
    getMeeting: readMeeting,

    renameMeeting: async (id, title) => {
      const meeting = await readMeeting(id)
      meeting.title = title.trim() || meeting.title
      return writeMeeting(meeting)
    },

    renameSpeaker: async (id, speaker, name) => {
      const meeting = await readMeeting(id)
      const names = { ...meeting.speakerNames }
      if (name.trim()) names[String(speaker)] = name.trim()
      else delete names[String(speaker)]
      meeting.speakerNames = names
      return writeMeeting(meeting)
    },

    deleteMeeting: async (id): Promise<DeleteResult> => {
      if (activeRecordings.has(id)) {
        return { ok: false, message: 'Stop the recording before deleting this meeting.' }
      }
      const meeting = await readMeeting(id).catch(() => null)
      if (!meeting) return { ok: false, message: 'This meeting no longer exists.' }
      if (isMeetingBusy(meeting)) {
        return {
          ok: false,
          message: 'This meeting is still being processed. Try again when it finishes.'
        }
      }
      try {
        meeting.deletedAt = new Date().toISOString()
        await writeMeeting(meeting)
        await Filesystem.mkdir({ path: 'trash', directory: DIR, recursive: true }).catch(
          () => undefined
        )
        await removeDir(trashDir(id))
        await Filesystem.rename({
          from: meetingDir(id),
          to: trashDir(id),
          directory: DIR,
          toDirectory: DIR
        })
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Could not move the meeting to Trash.'
        }
      }
    },

    listTrash,

    restoreMeeting: async (id) => {
      const meeting = await readJson<Meeting>(`${trashDir(id)}/meeting.json`)
      delete meeting.deletedAt
      if (isMeetingBusy(meeting)) {
        meeting.status = 'error'
        meeting.error =
          'This meeting was deleted before it finished. Retry transcription to continue.'
      }
      await writeJson(`${trashDir(id)}/meeting.json`, meeting)
      await Filesystem.mkdir({ path: 'meetings', directory: DIR, recursive: true }).catch(
        () => undefined
      )
      await Filesystem.rename({
        from: trashDir(id),
        to: meetingDir(id),
        directory: DIR,
        toDirectory: DIR
      })
      return meeting
    },

    deleteMeetingForever: (id) => removeDir(trashDir(id)),
    emptyTrash: () => removeDir('trash'),

    onMeetingStatus: (callback) => {
      statusListeners.add(callback)
      return () => {
        statusListeners.delete(callback)
      }
    },

    onShortcutAction: () => () => undefined,

    getAppInfo: async () => ({ name: 'Note Taker', version: __APP_VERSION__, isDev: false }),

    openScreenRecordingSettings: async () => undefined
  }
}

export async function installMobileApi(): Promise<void> {
  const { uri } = await Filesystem.getUri({ path: '', directory: DIR })
  baseUri = uri.replace(/\/$/, '')
  await recoverInterruptedMeetings()
  await purgeExpiredTrash().catch(() => undefined)
  window.api = buildApi()
}
