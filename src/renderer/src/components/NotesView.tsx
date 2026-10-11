import { useEffect, useRef, useState } from 'react'
import { isMeetingBusy, type Meeting, type SummaryType } from '../../../shared/types'
import {
  SUMMARY_LABELS,
  SUMMARY_TYPES,
  downloadTextFile,
  formatDuration,
  formatTimestamp,
  getSummaryFor,
  getTranscriptText,
  groupUtterances,
  meetingToMarkdown,
  speakerName
} from '@/lib/meeting-format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SpeakerLabel } from '@/components/SpeakerLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Copy, Download, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type NotesViewProps = {
  meeting: Meeting
  onMeetingUpdated: (meeting: Meeting) => void
  onDeleteMeeting: (meeting: Meeting) => void
}

type NotesTab = 'transcript' | SummaryType

function firstAvailableTab(meeting: Meeting): NotesTab {
  return SUMMARY_TYPES.find((type) => getSummaryFor(meeting, type)) ?? 'transcript'
}

export function NotesView({
  meeting,
  onMeetingUpdated,
  onDeleteMeeting
}: NotesViewProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<NotesTab>(() => firstAvailableTab(meeting))
  const [generating, setGenerating] = useState<SummaryType | null>(null)
  const [title, setTitle] = useState(meeting.title)
  const [retrying, setRetrying] = useState(false)
  const mediaRef = useRef<HTMLMediaElement | null>(null)

  useEffect(() => {
    setTitle(meeting.title)
  }, [meeting.id, meeting.title])

  const handleCopy = async (): Promise<void> => {
    const text =
      activeTab === 'transcript'
        ? getTranscriptText(meeting)
        : (getSummaryFor(meeting, activeTab) ?? '')
    await navigator.clipboard.writeText(text)
    toast.success(
      activeTab === 'transcript' ? 'Transcript copied to clipboard' : 'Summary copied to clipboard'
    )
  }

  const handleExport = (): void => {
    const safeName = meeting.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    downloadTextFile(`${safeName || 'meeting'}.md`, meetingToMarkdown(meeting))
  }

  const handleSeek = (seconds: number): void => {
    const media = mediaRef.current
    if (!media) return
    media.currentTime = seconds
    void media.play().catch(() => undefined)
  }

  const handleRenameSpeaker = async (speaker: number, name: string): Promise<void> => {
    const updated = await window.api.renameSpeaker(meeting.id, speaker, name)
    onMeetingUpdated(updated)
  }

  const handleGenerate = async (type: SummaryType): Promise<void> => {
    setGenerating(type)
    try {
      const updated = await window.api.transcribeMeeting(meeting.id, type)
      onMeetingUpdated(updated)
      if (updated.error) toast.error(updated.error)
      else toast.success(`${SUMMARY_LABELS[type]} summary ready`)
    } finally {
      setGenerating(null)
    }
  }

  const handleTitleBlur = async (): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed || trimmed === meeting.title) {
      setTitle(meeting.title)
      return
    }
    const updated = await window.api.renameMeeting(meeting.id, trimmed)
    onMeetingUpdated(updated)
  }

  const handleRetry = async (): Promise<void> => {
    setRetrying(true)
    try {
      const updated = await window.api.transcribeMeeting(meeting.id)
      onMeetingUpdated(updated)
      if (updated.status === 'error') {
        toast.error(updated.error ?? 'Transcription failed')
      } else {
        toast.success('Transcription complete')
      }
    } finally {
      setRetrying(false)
    }
  }

  const utteranceGroups = groupUtterances(meeting)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col items-stretch justify-between gap-4 border-b border-border p-4 md:flex-row md:items-start md:p-6">
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void handleTitleBlur()}
            className="text-lg font-semibold"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{new Date(meeting.createdAt).toLocaleString()}</span>
            <span>•</span>
            <span>{formatDuration(meeting.durationMs)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleCopy()}>
            <Copy className="size-4" />
            Copy
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={meeting.status !== 'done'}>
            <Download className="size-4" />
            Export
          </Button>
          <Button
            variant="outline"
            aria-label="Delete meeting"
            disabled={isMeetingBusy(meeting)}
            onClick={() => onDeleteMeeting(meeting)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {meeting.source !== 'upload' || meeting.audioExt ? (
        <div className="border-b border-border px-6 py-3">
          {meeting.hasScreenRecording ? (
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              key={meeting.id}
              controls
              preload="metadata"
              className="max-h-64 w-full rounded-lg bg-black"
              src={window.api.mediaUrl(meeting, 'screen')}
            />
          ) : (
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              key={meeting.id}
              controls
              preload="metadata"
              className="w-full"
              src={window.api.mediaUrl(meeting, 'audio')}
            />
          )}
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden p-4 md:p-6">
        {meeting.status === 'error' && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Transcription failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{meeting.error}</p>
              <Button variant="outline" onClick={() => void handleRetry()} disabled={retrying}>
                {retrying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Retrying…
                  </>
                ) : (
                  'Retry transcription'
                )}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {(meeting.status === 'uploading' || meeting.status === 'transcribing') && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {meeting.status === 'uploading' ? 'Uploading audio…' : 'Transcribing…'}
            </p>
          </div>
        )}

        {meeting.status === 'done' && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as NotesTab)}
            className="flex h-full flex-col"
          >
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              {SUMMARY_TYPES.map((type) => (
                <TabsTrigger key={type} value={type}>
                  {SUMMARY_LABELS[type]}
                </TabsTrigger>
              ))}
            </TabsList>

            {SUMMARY_TYPES.map((type) => {
              const text = getSummaryFor(meeting, type)
              return (
                <TabsContent key={type} value={type} className="mt-4 flex-1 overflow-hidden">
                  {text ? (
                    <ScrollArea className="h-[calc(100vh-420px)] rounded-lg border border-border p-4">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{text}</pre>
                    </ScrollArea>
                  ) : (
                    <div className="flex h-[calc(100vh-420px)] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                      <p className="max-w-sm text-sm text-muted-foreground">
                        No {SUMMARY_LABELS[type].toLowerCase()} summary for this meeting yet.
                        Generating one re-runs transcription on the saved audio.
                      </p>
                      <Button
                        variant="outline"
                        disabled={generating !== null}
                        onClick={() => void handleGenerate(type)}
                      >
                        {generating === type ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" />
                            Generate {SUMMARY_LABELS[type].toLowerCase()} summary
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </TabsContent>
              )
            })}

            <TabsContent value="transcript" className="mt-4 flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-420px)] rounded-lg border border-border p-4">
                <div className="space-y-4">
                  {utteranceGroups.length > 0 ? (
                    utteranceGroups.map((group, index) => (
                      <div key={`${group.speaker}-${group.start}-${index}`} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <SpeakerLabel
                            name={speakerName(meeting, group.speaker)}
                            onRename={(name) => void handleRenameSpeaker(group.speaker, name)}
                          />
                          <button
                            type="button"
                            onClick={() => handleSeek(group.start)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                            title="Play from here"
                          >
                            ▶ {formatTimestamp(group.start)}
                          </button>
                        </div>
                        <p className="text-sm leading-6">{group.text}</p>
                      </div>
                    ))
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-6">
                      {meeting.fullTranscript || 'No transcript available.'}
                    </pre>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
