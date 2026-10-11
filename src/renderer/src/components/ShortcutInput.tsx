import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

type ShortcutInputProps = {
  id: string
  value: string
  onChange: (accelerator: string) => void
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'])

function keyFromEvent(event: KeyboardEvent): string | null {
  const { code } = event
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  if (code.startsWith('Arrow')) return code.slice(5)
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Return',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/'
  }
  return named[code] ?? null
}

export function ShortcutInput({ id, value, onChange }: ShortcutInputProps): React.JSX.Element {
  const [capturing, setCapturing] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!capturing) return

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setCapturing(false)
        setHint(null)
        return
      }
      if (MODIFIER_KEYS.has(event.key)) return

      const key = keyFromEvent(event)
      if (!key) {
        setHint('That key is not supported')
        return
      }
      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        setHint('Include Ctrl, Alt or Super')
        return
      }

      const parts: string[] = []
      if (event.ctrlKey) parts.push('Ctrl')
      if (event.altKey) parts.push('Alt')
      if (event.shiftKey) parts.push('Shift')
      if (event.metaKey) parts.push('Super')
      parts.push(key)

      onChange(parts.join('+'))
      setCapturing(false)
      setHint(null)
    }

    // Capture phase so the dialog's own Escape/Tab handling does not swallow the combo.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, onChange])

  return (
    <div className="flex items-center gap-2">
      <Button
        ref={buttonRef}
        id={id}
        type="button"
        variant="outline"
        className="min-w-48 justify-start font-mono text-sm"
        onClick={() => {
          setHint(null)
          setCapturing(true)
        }}
        onBlur={() => {
          setCapturing(false)
          setHint(null)
        }}
      >
        {capturing
          ? (hint ?? 'Press the shortcut…')
          : value
            ? value.replace(/\+/g, ' + ')
            : 'Not set'}
      </Button>
      {value && !capturing && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear shortcut"
          onClick={() => onChange('')}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  )
}
