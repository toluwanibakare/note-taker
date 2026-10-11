import type { RecordingMode } from '../../../shared/types'

export type RecordingSession = {
  recorder: MediaRecorder
  screenRecorder: MediaRecorder | null
  ctx: AudioContext
  sysStream: MediaStream | null
  micStream: MediaStream
  systemAudioOk: boolean
  pendingChunks: Set<Promise<void>>
  onSystemAudioEnded?: () => void
}

export async function startRecording(
  meetingId: string,
  mode: RecordingMode = 'audio'
): Promise<RecordingSession> {
  // System audio rides on the screen-share stream, so it is requested in both modes. Audio-only
  // keeps the video tiny because it is discarded; screen mode asks for a usable picture.
  // A denied screen/system-audio permission must not take the microphone down with it.
  const wantsScreen = mode === 'audio_screen' && window.api.capabilities.screenRecording
  const canCaptureSystem = window.api.capabilities.systemAudio
  const sysStream = !canCaptureSystem
    ? null
    : await navigator.mediaDevices
        .getDisplayMedia({
          audio: true,
          video: wantsScreen
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15 } }
            : { width: 320, height: 240, frameRate: 1 }
        })
        .catch(() => null)

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })

  const sysTrack = sysStream?.getAudioTracks()[0]
  const systemAudioOk = !!sysTrack && sysTrack.readyState === 'live'

  const ctx = new AudioContext({ sampleRate: 48000 })
  const dest = ctx.createMediaStreamDestination()
  ctx.createMediaStreamSource(micStream).connect(dest)
  if (sysTrack && systemAudioOk) {
    ctx.createMediaStreamSource(new MediaStream([sysTrack])).connect(dest)
  }

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'

  const recorder = new MediaRecorder(dest.stream, {
    mimeType,
    audioBitsPerSecond: 128000
  })

  const pendingChunks = new Set<Promise<void>>()

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return
    // Reading the blob is async, so stopRecording has to wait for these before telling main to
    // close the file — otherwise the last chunk arrives after the stream is gone.
    const pending = event.data.arrayBuffer().then((buffer) => {
      window.api.sendChunk(meetingId, new Uint8Array(buffer))
    })
    pendingChunks.add(pending)
    void pending.finally(() => pendingChunks.delete(pending))
  }

  recorder.start(5000)

  // The picture goes to its own file so the audio sent for transcription stays small.
  let screenRecorder: MediaRecorder | null = null
  const videoTrack = sysStream?.getVideoTracks()[0]
  if (wantsScreen && videoTrack && videoTrack.readyState === 'live') {
    const screenMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm'
    screenRecorder = new MediaRecorder(
      new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]),
      { mimeType: screenMime, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 96000 }
    )
    screenRecorder.ondataavailable = (event) => {
      if (event.data.size === 0) return
      const pending = event.data.arrayBuffer().then((buffer) => {
        window.api.sendChunk(meetingId, new Uint8Array(buffer), 'screen')
      })
      pendingChunks.add(pending)
      void pending.finally(() => pendingChunks.delete(pending))
    }
    screenRecorder.start(5000)
  }

  const session: RecordingSession = {
    recorder,
    screenRecorder,
    ctx,
    sysStream,
    micStream,
    systemAudioOk,
    pendingChunks
  }

  if (sysTrack) {
    sysTrack.onended = () => {
      session.onSystemAudioEnded?.()
    }
  }

  return session
}

function stopRecorder(recorder: MediaRecorder): Promise<void> {
  return new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
    if (recorder.state !== 'inactive') {
      recorder.stop()
    } else {
      resolve()
    }
  })
}

export async function stopRecording(session: RecordingSession): Promise<void> {
  await Promise.all([
    stopRecorder(session.recorder),
    session.screenRecorder ? stopRecorder(session.screenRecorder) : Promise.resolve()
  ])

  await Promise.allSettled(session.pendingChunks)

  for (const stream of [session.sysStream, session.micStream]) {
    for (const track of stream?.getTracks() ?? []) {
      track.stop()
    }
  }

  await session.ctx.close()
}
