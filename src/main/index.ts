import {
  app,
  shell,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  protocol,
  session,
  Tray
} from 'electron'
import { createReadStream, existsSync } from 'fs'
import { stat } from 'fs/promises'
import { extname, join } from 'path'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getSettings, saveSettings } from './settings'
import {
  appendChunk,
  audioFilePath,
  closeAudioStream,
  createMeeting,
  deleteForever,
  emptyTrash,
  listTrash,
  purgeExpiredTrash,
  restoreMeeting,
  trashMeeting,
  importAudioMeeting,
  listMeetings,
  openAudioStream,
  screenFilePath,
  type StreamKind,
  readMeeting,
  recoverInterruptedMeetings,
  renameMeeting,
  renameSpeaker,
  writeMeeting
} from './storage'
import { transcribe } from './gladia'
import { applyShortcuts } from './shortcuts'
import { isMeetingBusy } from '../shared/types'
import type {
  DeleteResult,
  RecordingMode,
  SaveSettingsResult,
  Settings,
  ShortcutAction,
  SummaryType
} from '../shared/types'

// Chromium's CoreAudio Tap loopback path (MacCatapLoopbackAudioForScreenShare) is enabled by
// default as of Electron 39, so no feature switch is needed. Capture instead depends on the
// NSAudioCaptureUsageDescription Info.plist key and the "System Audio Recording Only" grant.

const MEDIA_TYPES: Record<string, string> = {
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska'
}

// Lets the renderer play saved recordings without opening file:// access to the whole disk.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'meeting-media',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
  }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
// Meetings being recorded right now; closing the window must not kill these.
const activeRecordings = new Set<string>()

function createTray(): void {
  try {
    tray = new Tray(
      nativeImage.createFromPath(icon).resize({
        width: process.platform === 'darwin' ? 18 : 22,
        height: process.platform === 'darwin' ? 18 : 22
      })
    )
  } catch {
    // Some desktops have no tray; the app still works without one.
    return
  }
  tray.setToolTip('Note Taker')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Note Taker', click: () => showWindow() },
      {
        label: 'Start / stop meeting',
        click: () => {
          showWindow()
          sendAction('toggle-meeting')
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => showWindow())
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function sendAction(action: ShortcutAction): void {
  const send = (): void => mainWindow?.webContents.send('shortcut:action', action)
  if (!mainWindow) return
  // A freshly created window has not loaded the renderer yet, so wait for it.
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send)
  else send()
}

function handleArgv(argv: string[]): void {
  showWindow()
  if (argv.includes('--toggle-meeting')) sendAction('toggle-meeting')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Closing the window mid-recording hides it instead, so the meeting is not lost.
  mainWindow.on('close', (event) => {
    if (isQuitting || activeRecordings.size === 0) return
    event.preventDefault()
    mainWindow?.hide()
    if (Notification.isSupported()) {
      new Notification({
        title: 'Note Taker is still recording',
        body: 'Use the tray icon or your meeting shortcut to stop it.'
      }).show()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('settings:get', async () => getSettings())

  ipcMain.handle(
    'settings:save',
    async (_event, settings: Settings): Promise<SaveSettingsResult> => {
      const { launchApp, toggleMeeting } = settings.shortcuts
      if (launchApp && launchApp === toggleMeeting) {
        throw new Error('The two shortcuts must be different.')
      }
      const saved = await saveSettings(settings)
      const shortcutWarning = await applyShortcuts(
        saved.shortcuts,
        { showWindow, sendAction },
        { mode: 'save', packaged: app.isPackaged }
      )
      return { settings: saved, shortcutWarning }
    }
  )

  ipcMain.handle('recording:start', async (_event, mode: RecordingMode = 'audio') => {
    const meeting = await createMeeting(mode)
    openAudioStream(meeting.id)
    if (mode === 'audio_screen') openAudioStream(meeting.id, 'screen')
    activeRecordings.add(meeting.id)
    return meeting
  })

  ipcMain.on(
    'recording:chunk',
    (_event, id: string, chunk: Uint8Array, kind: StreamKind = 'audio') => {
      appendChunk(id, chunk, kind)
    }
  )

  ipcMain.handle('recording:stop', async (_event, id: string, durationMs: number) => {
    activeRecordings.delete(id)
    // Stopped from the tray or a shortcut while hidden: bring the window back to show progress.
    if (mainWindow && !mainWindow.isVisible()) showWindow()
    await closeAudioStream(id)
    const meeting = await readMeeting(id)
    meeting.durationMs = durationMs
    meeting.status = 'uploading'
    return writeMeeting(meeting)
  })

  ipcMain.handle('meeting:import', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose an audio or video file',
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio / video',
          extensions: [
            'mp3',
            'wav',
            'm4a',
            'aac',
            'ogg',
            'opus',
            'flac',
            'webm',
            'mp4',
            'mov',
            'mkv'
          ]
        }
      ]
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return importAudioMeeting(result.filePaths[0])
  })

  ipcMain.handle(
    'meeting:transcribe',
    async (event, id: string, requestedSummaryType?: SummaryType) => {
      const settings = await getSettings()
      if (!settings.gladiaApiKey) {
        const meeting = await readMeeting(id)
        meeting.status = 'error'
        meeting.error = 'Gladia API key is not configured.'
        await writeMeeting(meeting)
        return meeting
      }

      const summaryType = requestedSummaryType ?? settings.summaryType
      let meeting = await readMeeting(id)
      const previousStatus = meeting.status
      meeting.status = 'uploading'
      meeting.error = undefined
      await writeMeeting(meeting)
      event.sender.send('meeting:status', { id, status: 'uploading' })

      try {
        const result = await transcribe(
          audioFilePath(id, meeting.audioExt ?? 'webm'),
          settings.gladiaApiKey,
          { summaryType, language: settings.language },
          (status) => {
            const nextStatus = status === 'uploading' ? 'uploading' : 'transcribing'
            event.sender.send('meeting:status', { id, status: nextStatus })
          }
        )

        meeting = await readMeeting(id)
        meeting.status = 'done'
        meeting.summaries = { ...meeting.summaries, [summaryType]: result.summary }
        meeting.summary = result.summary
        meeting.fullTranscript = result.fullTranscript
        meeting.utterances = result.utterances
        meeting.error = undefined
        await writeMeeting(meeting)
        event.sender.send('meeting:status', { id, status: 'done' })
        return meeting
      } catch (error) {
        meeting = await readMeeting(id)
        // A failed extra summary must not hide a transcript that already exists.
        meeting.status = previousStatus === 'done' ? 'done' : 'error'
        meeting.error = error instanceof Error ? error.message : 'Transcription failed'
        await writeMeeting(meeting)
        event.sender.send('meeting:status', { id, status: meeting.status })
        return meeting
      }
    }
  )

  ipcMain.handle('meeting:list', async () => listMeetings())

  ipcMain.handle('meeting:get', async (_event, id: string) => readMeeting(id))

  ipcMain.handle('meeting:rename', async (_event, id: string, title: string) =>
    renameMeeting(id, title)
  )

  ipcMain.handle(
    'meeting:renameSpeaker',
    async (_event, id: string, speaker: number, name: string) => renameSpeaker(id, speaker, name)
  )

  // "Delete" only moves a meeting to the trash; trash:* handlers do the permanent removal.
  ipcMain.handle('meeting:delete', async (_event, id: string): Promise<DeleteResult> => {
    // Moving the folder while audio is still being written or uploaded breaks that work, so a
    // meeting that is mid-flight has to finish (or be stopped) first.
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
      await trashMeeting(id)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Could not move the meeting to Trash.'
      }
    }
  })

  ipcMain.handle('trash:list', async () => listTrash())
  ipcMain.handle('trash:restore', async (_event, id: string) => restoreMeeting(id))
  ipcMain.handle('trash:deleteForever', async (_event, id: string) => deleteForever(id))
  ipcMain.handle('trash:empty', async () => emptyTrash())

  ipcMain.handle('system:getAppInfo', async () => ({
    name: app.getName(),
    version: app.getVersion(),
    isDev: is.dev
  }))

  ipcMain.handle('system:openScreenRecordingSettings', async () => {
    if (process.platform !== 'darwin') return
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => handleArgv(argv))
}

app.whenReady().then(async () => {
  if (!gotLock) return
  electronApp.setAppUserModelId('com.note-taker.app')

  // The macOS system picker never asks Chromium for a CoreAudio Tap, so system audio silently
  // stays absent. Selecting the screen ourselves is what triggers the tap, and it also spares the
  // user a picker on every meeting.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      // Calling back with no stream throws when video was requested; the renderer already
      // falls back to microphone-only when the request fails, so just stop it quietly.
      const deny = (): void => {
        try {
          callback({})
        } catch {
          // request denied
        }
      }
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (sources.length === 0) {
            deny()
            return
          }
          callback({ video: sources[0], audio: 'loopback' })
        })
        .catch(() => deny())
    },
    { useSystemPicker: false }
  )

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  protocol.handle('meeting-media', async (request) => {
    const url = new URL(request.url)
    const id = url.hostname
    const kind = url.pathname.replace('/', '')
    // The id is joined into a filesystem path, so only accept the UUIDs we generate.
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Bad request', { status: 400 })

    let path: string
    if (kind === 'screen') {
      path = screenFilePath(id)
    } else if (kind === 'audio') {
      const meeting = await readMeeting(id).catch(() => null)
      if (!meeting) return new Response('Not found', { status: 404 })
      path = audioFilePath(id, meeting.audioExt ?? 'webm')
    } else {
      return new Response('Bad request', { status: 400 })
    }

    if (!existsSync(path)) return new Response('Not found', { status: 404 })

    const size = (await stat(path)).size
    if (size === 0) return new Response('Empty recording', { status: 404 })

    const type = MEDIA_TYPES[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream'
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
    let start = 0
    let end = size - 1
    if (range) {
      if (range[1] === '' && range[2] !== '') {
        start = Math.max(0, size - Number(range[2]))
      } else {
        start = range[1] === '' ? 0 : Number(range[1])
        if (range[2] !== '') end = Math.min(end, Number(range[2]))
      }
      if (start > end || start >= size) {
        return new Response('Range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        })
      }
    }

    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })

  await recoverInterruptedMeetings()
  await purgeExpiredTrash().catch(() => 0)
  registerIpcHandlers()
  createWindow()
  createTray()
  if (process.argv.includes('--toggle-meeting')) sendAction('toggle-meeting')

  const { shortcuts } = await getSettings()
  void applyShortcuts(
    shortcuts,
    { showWindow, sendAction },
    { mode: 'startup', packaged: app.isPackaged }
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
