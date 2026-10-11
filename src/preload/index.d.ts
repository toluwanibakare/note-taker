import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  DeleteResult,
  Meeting,
  MeetingStatusEvent,
  Settings,
  AppInfo,
  SaveSettingsResult,
  RecordingMode,
  ShortcutAction,
  SummaryType
} from '../shared/types'

export type Capabilities = {
  systemAudio: boolean
  screenRecording: boolean
  shortcuts: boolean
  // Phones share text through the system share sheet instead of downloading a file.
  nativeShare: boolean
}

export interface Api {
  capabilities: Capabilities
  // URL the renderer can play a saved recording from.
  mediaUrl: (meeting: Meeting, kind: 'audio' | 'screen') => string
  shareText?: (title: string, text: string) => Promise<void>
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<SaveSettingsResult>
  startRecording: (mode?: RecordingMode) => Promise<Meeting>
  sendChunk: (id: string, chunk: Uint8Array, kind?: 'audio' | 'screen') => void
  stopRecording: (id: string, durationMs: number) => Promise<Meeting>
  transcribeMeeting: (id: string, summaryType?: SummaryType) => Promise<Meeting>
  importAudio: () => Promise<Meeting | null>
  onShortcutAction: (callback: (action: ShortcutAction) => void) => () => void
  listMeetings: () => Promise<Meeting[]>
  getMeeting: (id: string) => Promise<Meeting>
  renameMeeting: (id: string, title: string) => Promise<Meeting>
  renameSpeaker: (id: string, speaker: number, name: string) => Promise<Meeting>
  listTrash: () => Promise<Meeting[]>
  restoreMeeting: (id: string) => Promise<Meeting>
  deleteMeetingForever: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  deleteMeeting: (id: string) => Promise<DeleteResult>
  onMeetingStatus: (callback: (event: MeetingStatusEvent) => void) => () => void
  getAppInfo: () => Promise<AppInfo>
  openScreenRecordingSettings: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
