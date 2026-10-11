import { app } from 'electron'
import { createWriteStream, type WriteStream } from 'fs'
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { randomUUID } from 'crypto'
import {
  TRASH_RETENTION_DAYS,
  isMeetingBusy,
  type Meeting,
  type RecordingMode
} from '../shared/types'

export type StreamKind = 'audio' | 'screen'

const audioStreams = new Map<string, WriteStream>()

function streamKey(id: string, kind: StreamKind): string {
  return `${id}:${kind}`
}

function meetingsRoot(): string {
  return join(app.getPath('userData'), 'meetings')
}

function meetingDir(id: string): string {
  return join(meetingsRoot(), id)
}

function meetingJsonPath(id: string): string {
  return join(meetingDir(id), 'meeting.json')
}

export function audioFilePath(id: string, ext = 'webm'): string {
  return join(meetingDir(id), `audio.${ext}`)
}

export function screenFilePath(id: string): string {
  return join(meetingDir(id), 'screen.webm')
}

export async function createMeeting(mode: RecordingMode = 'audio'): Promise<Meeting> {
  const id = randomUUID()
  const meeting: Meeting = {
    id,
    title: `Meeting — ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    durationMs: 0,
    status: 'recording',
    source: 'recording',
    recordingMode: mode,
    hasScreenRecording: mode === 'audio_screen',
    audioExt: 'webm'
  }

  await mkdir(meetingDir(id), { recursive: true })
  await writeFile(meetingJsonPath(id), JSON.stringify(meeting, null, 2), 'utf-8')
  return meeting
}

export async function importAudioMeeting(sourcePath: string): Promise<Meeting> {
  const id = randomUUID()
  const ext = extname(sourcePath).replace('.', '').toLowerCase() || 'audio'
  const meeting: Meeting = {
    id,
    title: basename(sourcePath, extname(sourcePath)) || `Upload — ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    durationMs: 0,
    status: 'uploading',
    source: 'upload',
    audioExt: ext
  }

  await mkdir(meetingDir(id), { recursive: true })
  await copyFile(sourcePath, audioFilePath(id, ext))
  await writeFile(meetingJsonPath(id), JSON.stringify(meeting, null, 2), 'utf-8')
  return meeting
}

export function openAudioStream(id: string, kind: StreamKind = 'audio'): WriteStream {
  const path = kind === 'screen' ? screenFilePath(id) : audioFilePath(id)
  const stream = createWriteStream(path, { flags: 'w' })
  audioStreams.set(streamKey(id, kind), stream)
  return stream
}

export function appendChunk(id: string, chunk: Uint8Array, kind: StreamKind = 'audio'): void {
  const stream = audioStreams.get(streamKey(id, kind))
  if (!stream || stream.writableEnded) {
    // A chunk that lands after the stream closed is not worth crashing the app over.
    console.warn(`Dropping ${kind} chunk for meeting ${id}: no open stream`)
    return
  }
  stream.write(Buffer.from(chunk))
}

export async function closeAudioStream(id: string): Promise<void> {
  for (const kind of ['audio', 'screen'] as const) {
    const key = streamKey(id, kind)
    const stream = audioStreams.get(key)
    if (!stream) continue

    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => {
        if (error) reject(error)
        else resolve()
      })
    })
    audioStreams.delete(key)
  }
}

export async function readMeeting(id: string): Promise<Meeting> {
  const raw = await readFile(meetingJsonPath(id), 'utf-8')
  return JSON.parse(raw) as Meeting
}

export async function writeMeeting(meeting: Meeting): Promise<Meeting> {
  await mkdir(meetingDir(meeting.id), { recursive: true })
  await writeFile(meetingJsonPath(meeting.id), JSON.stringify(meeting, null, 2), 'utf-8')
  return meeting
}

export async function listMeetings(): Promise<Meeting[]> {
  try {
    const dirs = await readdir(meetingsRoot())
    const meetings: Meeting[] = []

    for (const dir of dirs) {
      try {
        const meeting = await readMeeting(dir)
        meetings.push(meeting)
      } catch {
        // skip invalid meeting dirs
      }
    }

    return meetings.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  } catch {
    return []
  }
}

function trashRoot(): string {
  return join(app.getPath('userData'), 'trash')
}

function trashDir(id: string): string {
  return join(trashRoot(), id)
}

// Deleting moves the whole meeting folder into the trash so it can still be restored.
export async function trashMeeting(id: string): Promise<void> {
  await closeAudioStream(id)
  const meeting = await readMeeting(id)
  meeting.deletedAt = new Date().toISOString()
  await writeMeeting(meeting)
  await mkdir(trashRoot(), { recursive: true })
  await rm(trashDir(id), { recursive: true, force: true })
  await rename(meetingDir(id), trashDir(id))
}

export async function listTrash(): Promise<Meeting[]> {
  try {
    const dirs = await readdir(trashRoot())
    const meetings: Meeting[] = []
    for (const dir of dirs) {
      try {
        const raw = await readFile(join(trashDir(dir), 'meeting.json'), 'utf-8')
        meetings.push(JSON.parse(raw) as Meeting)
      } catch {
        // skip invalid trash dirs
      }
    }
    return meetings.sort(
      (a, b) => new Date(b.deletedAt ?? 0).getTime() - new Date(a.deletedAt ?? 0).getTime()
    )
  } catch {
    return []
  }
}

export async function restoreMeeting(id: string): Promise<Meeting> {
  const path = join(trashDir(id), 'meeting.json')
  const meeting = JSON.parse(await readFile(path, 'utf-8')) as Meeting
  delete meeting.deletedAt
  if (isMeetingBusy(meeting)) {
    meeting.status = 'error'
    meeting.error = 'This meeting was deleted before it finished. Retry transcription to continue.'
  }
  await writeFile(path, JSON.stringify(meeting, null, 2), 'utf-8')
  await mkdir(meetingsRoot(), { recursive: true })
  await rename(trashDir(id), meetingDir(id))
  return meeting
}

export async function deleteForever(id: string): Promise<void> {
  await rm(trashDir(id), { recursive: true, force: true })
}

export async function emptyTrash(): Promise<void> {
  await rm(trashRoot(), { recursive: true, force: true })
}

export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let purged = 0
  for (const meeting of await listTrash()) {
    // Without a deletion date we cannot tell its age, so keep it rather than guess.
    if (!meeting.deletedAt) continue
    if (new Date(meeting.deletedAt).getTime() < cutoff) {
      await deleteForever(meeting.id)
      purged++
    }
  }
  return purged
}

export async function renameMeeting(id: string, title: string): Promise<Meeting> {
  const meeting = await readMeeting(id)
  meeting.title = title.trim() || meeting.title
  return writeMeeting(meeting)
}

export async function renameSpeaker(id: string, speaker: number, name: string): Promise<Meeting> {
  const meeting = await readMeeting(id)
  const names = { ...meeting.speakerNames }
  const trimmed = name.trim()
  if (trimmed) names[String(speaker)] = trimmed
  else delete names[String(speaker)]
  meeting.speakerNames = names
  return writeMeeting(meeting)
}

// A crash or forced quit leaves meetings stuck mid-flight. Turn them into a retryable error so the
// existing "Retry transcription" button can pick them up, instead of showing a spinner forever.
export async function recoverInterruptedMeetings(): Promise<number> {
  const inFlight = new Set(['recording', 'uploading', 'transcribing'])
  let recovered = 0

  for (const meeting of await listMeetings()) {
    if (!inFlight.has(meeting.status)) continue

    const audio = audioFilePath(meeting.id, meeting.audioExt ?? 'webm')
    const size = await stat(audio)
      .then((info) => info.size)
      .catch(() => 0)

    meeting.status = 'error'
    meeting.error =
      size > 0
        ? 'This meeting was interrupted before it finished. The audio was saved, so you can retry transcription.'
        : 'This meeting was interrupted before any audio was saved.'
    await writeMeeting(meeting)
    recovered++
  }

  return recovered
}
