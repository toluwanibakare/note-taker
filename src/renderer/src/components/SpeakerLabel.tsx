import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Pencil } from 'lucide-react'

type SpeakerLabelProps = {
  name: string
  onRename: (name: string) => void
}

export function SpeakerLabel({ name, onRename }: SpeakerLabelProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const commit = (): void => {
    setEditing(false)
    if (draft.trim() !== name) onRename(draft)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setEditing(false)
        }}
        className="h-7 w-40 text-sm"
        aria-label="Speaker name"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name)
        setEditing(true)
      }}
      className="group inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:bg-accent"
      title="Click to rename this speaker"
    >
      {name}
      <Pencil className="size-3 opacity-0 transition-opacity group-hover:opacity-70" />
    </button>
  )
}
