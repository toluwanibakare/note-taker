import { useEffect, useState } from 'react'
import { isMeetingBusy, type Meeting } from '../../../shared/types'
import { formatDuration, formatRelativeDate } from '@/lib/meeting-format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Settings, Plus, Search, Trash2 } from 'lucide-react'

type MeetingListProps = {
  meetings: Meeting[]
  activeMeetingId: string | null
  onSelectMeeting: (id: string) => void
  onNewMeeting: () => void
  onDeleteMeeting: (meeting: Meeting) => void
  onOpenSettings: () => void
  onOpenTrash: () => void
  mobileVisible: boolean
}

function statusLabel(status: Meeting['status']): string {
  switch (status) {
    case 'recording':
      return 'Recording'
    case 'uploading':
      return 'Uploading'
    case 'transcribing':
      return 'Transcribing'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
  }
}

export function MeetingList({
  meetings,
  activeMeetingId,
  onSelectMeeting,
  onNewMeeting,
  onDeleteMeeting,
  onOpenSettings,
  onOpenTrash,
  mobileVisible
}: MeetingListProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.getAppInfo().then((info) => setVersion(info.version))
  }, [])

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? meetings.filter((meeting) =>
        [meeting.title, meeting.fullTranscript, meeting.summary].some((field) =>
          field?.toLowerCase().includes(needle)
        )
      )
    : meetings

  return (
    <aside
      className={`${mobileVisible ? 'flex w-full' : 'hidden'} h-full flex-col border-r border-border bg-card md:flex md:w-72`}
    >
      <div className="p-4">
        <Button className="w-full" onClick={onNewMeeting}>
          <Plus className="size-4" />
          New Meeting
        </Button>
      </div>

      <div className="relative px-4 pb-3">
        <Search className="pointer-events-none absolute left-7 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search meetings"
          className="pl-8"
          aria-label="Search meetings"
        />
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-4">
          {visible.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              {meetings.length === 0 ? 'No meetings yet.' : 'No meetings match your search.'}
            </p>
          ) : (
            visible.map((meeting) => (
              <div
                key={meeting.id}
                className={`group relative rounded-lg transition-colors ${
                  activeMeetingId === meeting.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectMeeting(meeting.id)}
                  className="w-full rounded-lg px-3 py-3 pr-10 text-left"
                >
                  <div className="truncate text-sm font-medium">{meeting.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{formatRelativeDate(meeting.createdAt)}</span>
                    <span>{formatDuration(meeting.durationMs)}</span>
                  </div>
                  <Badge variant="secondary" className="mt-2">
                    {statusLabel(meeting.status)}
                  </Badge>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${meeting.title}`}
                  disabled={isMeetingBusy(meeting)}
                  title={isMeetingBusy(meeting) ? 'Finish or stop this meeting first' : undefined}
                  className="absolute right-1 top-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => onDeleteMeeting(meeting)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />
      <div className="space-y-2 p-4">
        <Button variant="outline" className="w-full" onClick={onOpenTrash}>
          <Trash2 className="size-4" />
          Trash
        </Button>
        <Button variant="outline" className="w-full" onClick={onOpenSettings}>
          <Settings className="size-4" />
          Settings
        </Button>
        {version && (
          <p className="text-center text-xs text-muted-foreground">
            v {version.split('.').slice(0, 2).join('.')}
          </p>
        )}
      </div>
    </aside>
  )
}
