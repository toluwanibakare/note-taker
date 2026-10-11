import { useEffect, useRef, useState } from 'react'
import type { Meeting, RecordingMode } from '../../../shared/types'
import { startRecording, stopRecording, type RecordingSession } from '@/lib/recorder'
import { formatDuration } from '@/lib/meeting-format'
import { playSound } from '@/lib/sounds'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mic, Monitor, Upload, Volume2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { SystemAudioPermissionHelp } from '@/components/SystemAudioPermissionHelp'

type RecordViewProps = {
  hasApiKey: boolean
  onOpenSettings: () => void
  onMeetingCreated: (meeting: Meeting) => void
  onProcessingComplete: (meeting: Meeting) => void
  onStatusChange: (meeting: Meeting) => void
  toggleSignal: number
  soundEffects: boolean
}

type ViewState = 'idle' | 'recording' | 'processing'

export function RecordView({
  hasApiKey,
  onOpenSettings,
  onMeetingCreated,
  onProcessingComplete,
  onStatusChange,
  toggleSignal,
  soundEffects
}: RecordViewProps): React.JSX.Element {
  const [viewState, setViewState] = useState<ViewState>('idle')
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [systemAudioOk, setSystemAudioOk] = useState(true)
  const [processingLabel, setProcessingLabel] = useState('Uploading audio…')
  const [mode, setMode] = useState<RecordingMode>(() => {
    try {
      return localStorage.getItem('recordingMode') === 'audio_screen' ? 'audio_screen' : 'audio'
    } catch {
      return 'audio'
    }
  })

  const sessionRef = useRef<RecordingSession | null>(null)
  const startedAtRef = useRef<number>(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onMeetingStatus((event) => {
      if (!meeting || event.id !== meeting.id) return
      if (event.status === 'uploading') {
        setProcessingLabel('Uploading audio…')
      } else if (event.status === 'transcribing') {
        setProcessingLabel('Transcribing…')
      }
    })
    return unsubscribe
  }, [meeting])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  const handleStart = async (): Promise<void> => {
    if (!hasApiKey) {
      onOpenSettings()
      return
    }

    try {
      // Played before capture starts so the chime is not recorded as system audio.
      await playSound('start', soundEffects)
      const created = await window.api.startRecording(
        window.api.capabilities.screenRecording ? mode : 'audio'
      )
      setMeeting(created)
      onMeetingCreated(created)

      const session = await startRecording(
        created.id,
        window.api.capabilities.screenRecording ? mode : 'audio'
      )
      session.onSystemAudioEnded = () => {
        toast.warning('System audio stopped. Recording microphone only.')
        setSystemAudioOk(false)
      }

      sessionRef.current = session
      setSystemAudioOk(session.systemAudioOk)
      if (!session.systemAudioOk) {
        toast.warning('System audio unavailable. Recording microphone only.')
      }

      startedAtRef.current = Date.now()
      setElapsedMs(0)
      setViewState('recording')
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 250)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start recording')
    }
  }

  const handleStop = async (): Promise<void> => {
    if (!meeting || !sessionRef.current) return

    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    const durationMs = Date.now() - startedAtRef.current
    setElapsedMs(durationMs)
    setViewState('processing')
    setProcessingLabel('Uploading audio…')

    try {
      await stopRecording(sessionRef.current)
      sessionRef.current = null
      void playSound('stop', soundEffects)

      const stopped = await window.api.stopRecording(meeting.id, durationMs)
      setMeeting(stopped)
      onStatusChange(stopped)

      const transcribed = await window.api.transcribeMeeting(meeting.id)
      setMeeting(transcribed)
      onStatusChange(transcribed)
      onProcessingComplete(transcribed)
      void playSound(transcribed.status === 'error' ? 'error' : 'done', soundEffects)
      setViewState('idle')
      setMeeting(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stop recording')
      setViewState('idle')
    }
  }

  const handleUpload = async (): Promise<void> => {
    if (!hasApiKey) {
      onOpenSettings()
      return
    }

    try {
      const imported = await window.api.importAudio()
      if (!imported) return

      setMeeting(imported)
      onMeetingCreated(imported)
      setViewState('processing')
      setProcessingLabel('Uploading audio…')

      const transcribed = await window.api.transcribeMeeting(imported.id)
      onStatusChange(transcribed)
      onProcessingComplete(transcribed)
      void playSound(transcribed.status === 'error' ? 'error' : 'done', soundEffects)
      if (transcribed.status === 'error') toast.error(transcribed.error ?? 'Transcription failed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload audio')
    } finally {
      setViewState('idle')
      setMeeting(null)
    }
  }

  // The shortcut handler lives in an effect keyed only on the signal, so it reads the latest
  // handlers through a ref instead of a stale closure.
  const toggleRef = useRef<() => void>(() => {})
  useEffect(() => {
    toggleRef.current = () => {
      if (viewState === 'idle') void handleStart()
      else if (viewState === 'recording') void handleStop()
    }
  })

  useEffect(() => {
    if (toggleSignal === 0) return
    toggleRef.current()
  }, [toggleSignal])

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle>Meeting Recorder</CardTitle>
          <CardDescription>
            {window.api.capabilities.systemAudio
              ? 'Capture your microphone and system audio, then transcribe with Gladia.'
              : 'Record with your microphone, then transcribe with Gladia.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasApiKey && (
            <Alert>
              <AlertTitle>Gladia API key required</AlertTitle>
              <AlertDescription>
                Add your API key in Settings before starting a meeting.
                <Button variant="link" className="h-auto p-0 pl-1" onClick={onOpenSettings}>
                  Open Settings
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {viewState === 'idle' && window.api.capabilities.screenRecording && (
            <div className="flex justify-center">
              <Tabs
                value={mode}
                onValueChange={(value) => {
                  setMode(value as RecordingMode)
                  try {
                    localStorage.setItem('recordingMode', value as string)
                  } catch {
                    // Remembering the choice is a convenience only.
                  }
                }}
              >
                <TabsList>
                  <TabsTrigger value="audio">
                    <Mic className="size-4" />
                    Audio only
                  </TabsTrigger>
                  <TabsTrigger value="audio_screen">
                    <Monitor className="size-4" />
                    Audio + screen
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {viewState === 'idle' && (
            <div className="flex justify-center gap-3">
              <Button size="lg" onClick={() => void handleStart()} disabled={!hasApiKey}>
                Start Meeting
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => void handleUpload()}
                disabled={!hasApiKey}
              >
                <Upload className="size-4" />
                Upload Audio
              </Button>
            </div>
          )}

          {viewState === 'recording' && (
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                <span className="relative flex size-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex size-3 rounded-full bg-red-500" />
                </span>
                <span className="text-3xl font-semibold tabular-nums">
                  {formatDuration(elapsedMs)}
                </span>
              </div>

              <div className="flex justify-center gap-2">
                <Badge variant="secondary">
                  <Mic className="size-3" />
                  Microphone
                </Badge>
                <Badge variant={systemAudioOk ? 'secondary' : 'destructive'}>
                  <Volume2 className="size-3" />
                  System audio
                </Badge>
                {meeting?.recordingMode === 'audio_screen' && (
                  <Badge variant="secondary">
                    <Monitor className="size-3" />
                    Screen
                  </Badge>
                )}
              </div>

              {!systemAudioOk && <SystemAudioPermissionHelp />}

              <div className="flex justify-center">
                <Button size="lg" variant="destructive" onClick={() => void handleStop()}>
                  Stop Meeting
                </Button>
              </div>
            </div>
          )}

          {viewState === 'processing' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{processingLabel}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
