import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

const api = {
  capabilities: { systemAudio: true, screenRecording: true, shortcuts: true, nativeShare: false },
  mediaUrl: (meeting: Meeting, kind: 'audio' | 'screen'): string =>
    `meeting-media://${meeting.id}/${kind}`,
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Settings): Promise<SaveSettingsResult> =>
    ipcRenderer.invoke('settings:save', settings),
  startRecording: (mode: RecordingMode = 'audio'): Promise<Meeting> =>
    ipcRenderer.invoke('recording:start', mode),
  sendChunk: (id: string, chunk: Uint8Array, kind: 'audio' | 'screen' = 'audio'): void => {
    ipcRenderer.send('recording:chunk', id, chunk, kind)
  },
  stopRecording: (id: string, durationMs: number): Promise<Meeting> =>
    ipcRenderer.invoke('recording:stop', id, durationMs),
  transcribeMeeting: (id: string, summaryType?: SummaryType): Promise<Meeting> =>
    ipcRenderer.invoke('meeting:transcribe', id, summaryType),
  importAudio: (): Promise<Meeting | null> => ipcRenderer.invoke('meeting:import'),
  onShortcutAction: (callback: (action: ShortcutAction) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, action: ShortcutAction): void =>
      callback(action)
    ipcRenderer.on('shortcut:action', listener)
    return () => {
      ipcRenderer.removeListener('shortcut:action', listener)
    }
  },
  listMeetings: (): Promise<Meeting[]> => ipcRenderer.invoke('meeting:list'),
  getMeeting: (id: string): Promise<Meeting> => ipcRenderer.invoke('meeting:get', id),
  renameMeeting: (id: string, title: string): Promise<Meeting> =>
    ipcRenderer.invoke('meeting:rename', id, title),
  renameSpeaker: (id: string, speaker: number, name: string): Promise<Meeting> =>
    ipcRenderer.invoke('meeting:renameSpeaker', id, speaker, name),
  listTrash: (): Promise<Meeting[]> => ipcRenderer.invoke('trash:list'),
  restoreMeeting: (id: string): Promise<Meeting> => ipcRenderer.invoke('trash:restore', id),
  deleteMeetingForever: (id: string): Promise<void> =>
    ipcRenderer.invoke('trash:deleteForever', id),
  emptyTrash: (): Promise<void> => ipcRenderer.invoke('trash:empty'),
  deleteMeeting: (id: string): Promise<DeleteResult> => ipcRenderer.invoke('meeting:delete', id),
  onMeetingStatus: (callback: (event: MeetingStatusEvent) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: MeetingStatusEvent): void => {
      callback(payload)
    }
    ipcRenderer.on('meeting:status', listener)
    return () => {
      ipcRenderer.removeListener('meeting:status', listener)
    }
  },
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('system:getAppInfo'),
  openScreenRecordingSettings: (): Promise<void> =>
    ipcRenderer.invoke('system:openScreenRecordingSettings')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error exposed in non-isolated mode
  window.electron = electronAPI
  // @ts-expect-error exposed in non-isolated mode
  window.api = api
}
