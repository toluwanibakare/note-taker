import { useCallback, useEffect, useState } from 'react'
import { TRASH_RETENTION_DAYS, type Meeting } from '../../../shared/types'
import { formatDuration } from '@/lib/meeting-format'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type TrashDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestored: (meeting: Meeting) => void
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysLeft(meeting: Meeting): number {
  const deleted = meeting.deletedAt ? new Date(meeting.deletedAt).getTime() : Date.now()
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - deleted) / DAY_MS))
}

export function TrashDialog({
  open,
  onOpenChange,
  onRestored
}: TrashDialogProps): React.JSX.Element {
  const [items, setItems] = useState<Meeting[]>([])
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setItems(await window.api.listTrash())
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const run = async (action: () => Promise<void>, failure: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure)
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = (meeting: Meeting): Promise<void> =>
    run(async () => {
      const restored = await window.api.restoreMeeting(meeting.id)
      onRestored(restored)
      toast.success('Meeting restored')
    }, 'Could not restore meeting')

  const handleDeleteForever = (meeting: Meeting): Promise<void> =>
    run(async () => {
      await window.api.deleteMeetingForever(meeting.id)
      toast.success('Meeting deleted permanently')
    }, 'Could not delete meeting')

  const handleEmpty = (): Promise<void> =>
    run(async () => {
      await window.api.emptyTrash()
      setConfirmEmpty(false)
      toast.success('Trash emptied')
    }, 'Could not empty trash')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmEmpty(false)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Deleted meetings are kept for {TRASH_RETENTION_DAYS} days, then removed for good.
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Trash is empty.</p>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="space-y-2 pr-3">
              {items.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{meeting.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDuration(meeting.durationMs)} · {daysLeft(meeting)} day
                      {daysLeft(meeting) === 1 ? '' : 's'} left
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleRestore(meeting)}
                    >
                      <RotateCcw className="size-3.5" />
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${meeting.title} permanently`}
                      disabled={busy}
                      onClick={() => void handleDeleteForever(meeting)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {items.length > 0 &&
          (confirmEmpty ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/50 p-3">
              <p className="text-sm">
                Permanently delete {items.length} meeting{items.length === 1 ? '' : 's'}? This
                cannot be undone.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmEmpty(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleEmpty()}
                >
                  Delete all
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="destructive" disabled={busy} onClick={() => setConfirmEmpty(true)}>
                Empty trash
              </Button>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  )
}
