import { useEffect, useState } from 'react'
import type { Meeting } from '../../shared/types'
import { MeetingList } from '@/components/MeetingList'
import { NotesView } from '@/components/NotesView'
import { RecordView } from '@/components/RecordView'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TrashDialog } from '@/components/TrashDialog'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

type View = 'record' | 'notes'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('record')
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  // Narrow screens show either the meeting list or a meeting, never both side by side.
  const [showList, setShowList] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [soundEffects, setSoundEffects] = useState(true)
  const [toggleSignal, setToggleSignal] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<Meeting | null>(null)
  const [deleting, setDeleting] = useState(false)

  const activeMeeting = meetings.find((meeting) => meeting.id === activeMeetingId) ?? null

  const refreshMeetings = async (): Promise<void> => {
    const nextMeetings = await window.api.listMeetings()
    setMeetings(nextMeetings)
  }

  const refreshSettings = async (): Promise<void> => {
    const settings = await window.api.getSettings()
    setHasApiKey(Boolean(settings.gladiaApiKey.trim()))
    setSoundEffects(settings.soundEffects)
  }

  useEffect(() => {
    void refreshMeetings()
    void refreshSettings()
  }, [])

  useEffect(() => {
    return window.api.onShortcutAction((action) => {
      if (action !== 'toggle-meeting') return
      setActiveMeetingId(null)
      setView('record')
      setToggleSignal((count) => count + 1)
    })
  }, [])

  const handleConfirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const result = await window.api.deleteMeeting(pendingDelete.id)
      if (!result.ok) {
        toast.error(result.message)
        setPendingDelete(null)
        return
      }
      setMeetings((current) => current.filter((item) => item.id !== pendingDelete.id))
      if (activeMeetingId === pendingDelete.id) {
        setActiveMeetingId(null)
        setView('record')
      }
      toast.success('Moved to Trash')
      setPendingDelete(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete meeting')
    } finally {
      setDeleting(false)
    }
  }

  const upsertMeeting = (meeting: Meeting): void => {
    setMeetings((current) => {
      const existingIndex = current.findIndex((item) => item.id === meeting.id)
      if (existingIndex === -1) return [meeting, ...current]
      const next = [...current]
      next[existingIndex] = meeting
      return next
    })
  }

  const handleNewMeeting = (): void => {
    setActiveMeetingId(null)
    setView('record')
    setShowList(false)
  }

  const handleSelectMeeting = (id: string): void => {
    setActiveMeetingId(id)
    setView('notes')
    setShowList(false)
  }

  const handleProcessingComplete = (meeting: Meeting): void => {
    upsertMeeting(meeting)
    setActiveMeetingId(meeting.id)
    setView('notes')
    setShowList(false)
  }

  return (
    <div className="dark flex h-dvh bg-background text-foreground">
      <MeetingList
        mobileVisible={showList}
        meetings={meetings}
        activeMeetingId={activeMeetingId}
        onSelectMeeting={handleSelectMeeting}
        onNewMeeting={handleNewMeeting}
        onDeleteMeeting={setPendingDelete}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
      />

      <main
        className={`${showList ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col overflow-hidden md:flex`}
      >
        <div className="border-b border-border p-2 md:hidden">
          <Button variant="ghost" onClick={() => setShowList(true)}>
            <ChevronLeft className="size-4" />
            Meetings
          </Button>
        </div>
        {/* Kept mounted so switching to a note mid-recording does not drop the live session. */}
        <div className={view === 'record' || !activeMeeting ? 'min-h-0 flex-1' : 'hidden'}>
          <RecordView
            hasApiKey={hasApiKey}
            onOpenSettings={() => setSettingsOpen(true)}
            onMeetingCreated={upsertMeeting}
            onProcessingComplete={handleProcessingComplete}
            onStatusChange={upsertMeeting}
            toggleSignal={toggleSignal}
            soundEffects={soundEffects}
          />
        </div>
        {view === 'notes' && activeMeeting && (
          <NotesView
            key={activeMeeting.id}
            meeting={activeMeeting}
            onMeetingUpdated={upsertMeeting}
            onDeleteMeeting={setPendingDelete}
          />
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          if (!open) void refreshSettings()
        }}
      />
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this meeting to Trash?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title}” will move to Trash and be deleted for good after 30 days. You
              can restore it from Trash until then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
            >
              {deleting ? 'Moving…' : 'Move to Trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onRestored={(meeting) => upsertMeeting(meeting)}
      />
      <Toaster />
    </div>
  )
}

export default App
