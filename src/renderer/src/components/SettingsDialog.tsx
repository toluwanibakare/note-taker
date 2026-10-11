import { useEffect, useState } from 'react'
import { Settings } from '../../../shared/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShortcutInput } from '@/components/ShortcutInput'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({
    gladiaApiKey: '',
    summaryType: 'bullet_points',
    language: 'auto',
    soundEffects: true,
    shortcuts: { launchApp: '', toggleMeeting: '' }
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    void window.api.getSettings().then(setSettings)
  }, [open])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const { settings: saved, shortcutWarning } = await window.api.saveSettings(settings)
      setSettings(saved)
      if (shortcutWarning) toast.warning(shortcutWarning)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your Gladia API key and transcription preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gladia-api-key">Gladia API key</Label>
            <Input
              id="gladia-api-key"
              type="password"
              value={settings.gladiaApiKey}
              onChange={(event) =>
                setSettings((current) => ({ ...current, gladiaApiKey: event.target.value }))
              }
              placeholder="Paste your Gladia API key"
            />
          </div>

          <div className="space-y-2">
            <Label>Summary style</Label>
            <Select
              value={settings.summaryType}
              onValueChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  summaryType: value as Settings['summaryType']
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bullet_points">Bullet points</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Language</Label>
            <Select
              value={settings.language}
              onValueChange={(value) => {
                if (!value) return
                setSettings((current) => ({ ...current, language: value }))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="it">Italian</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sound-effects" className="font-normal">
              Sound effects (recording on/off, transcript ready)
            </Label>
            <input
              id="sound-effects"
              type="checkbox"
              className="size-4 accent-primary"
              checked={settings.soundEffects}
              onChange={(event) =>
                setSettings((current) => ({ ...current, soundEffects: event.target.checked }))
              }
            />
          </div>

          {window.api.capabilities.shortcuts && (
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <Label>Keyboard shortcuts</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Work system-wide, even when the app is in the background. Click a field, then
                  press the keys.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="shortcut-launch" className="font-normal">
                  Open Note Taker
                </Label>
                <ShortcutInput
                  id="shortcut-launch"
                  value={settings.shortcuts.launchApp}
                  onChange={(launchApp) =>
                    setSettings((current) => ({
                      ...current,
                      shortcuts: { ...current.shortcuts, launchApp }
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="shortcut-toggle" className="font-normal">
                  Start / stop meeting
                </Label>
                <ShortcutInput
                  id="shortcut-toggle"
                  value={settings.shortcuts.toggleMeeting}
                  onChange={(toggleMeeting) =>
                    setSettings((current) => ({
                      ...current,
                      shortcuts: { ...current.shortcuts, toggleMeeting }
                    }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
