export type RecordingMode = 'audio' | 'audio_screen'

export type MeetingStatus = 'recording' | 'uploading' | 'transcribing' | 'done' | 'error'

export type Utterance = {
  start: number
  end: number
  speaker: number
  text: string
}

export type Meeting = {
  id: string
  title: string
  createdAt: string
  durationMs: number
  status: MeetingStatus
  error?: string
  summary?: string
  summaries?: Partial<Record<SummaryType, string>>
  source?: 'recording' | 'upload'
  recordingMode?: RecordingMode
  hasScreenRecording?: boolean
  audioExt?: string
  utterances?: Utterance[]
  // Keyed by the zero-based speaker index Gladia assigns.
  speakerNames?: Record<string, string>
  // Set while the meeting sits in the trash; it is purged for good after TRASH_RETENTION_DAYS.
  deletedAt?: string
  fullTranscript?: string
}

export type SummaryType = 'general' | 'bullet_points' | 'concise'

export type Shortcuts = {
  // Electron accelerator strings such as "Ctrl+Alt+R". Empty string means unset.
  launchApp: string
  toggleMeeting: string
}

export type Settings = {
  gladiaApiKey: string
  summaryType: SummaryType
  language: string | 'auto'
  soundEffects: boolean
  shortcuts: Shortcuts
}

export type SaveSettingsResult = {
  settings: Settings
  shortcutWarning?: string
}

export type ShortcutAction = 'toggle-meeting'

export type MeetingStatusEvent = {
  id: string
  status: MeetingStatus
}

export type AppInfo = {
  name: string
  version: string
  isDev: boolean
}

export const TRASH_RETENTION_DAYS = 30

export type DeleteResult = { ok: true } | { ok: false; message: string }

export function isMeetingBusy(meeting: Pick<Meeting, 'status'>): boolean {
  return (
    meeting.status === 'recording' ||
    meeting.status === 'uploading' ||
    meeting.status === 'transcribing'
  )
}
