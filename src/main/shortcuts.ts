import { globalShortcut } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ShortcutAction, Shortcuts } from '../shared/types'

const run = promisify(execFile)

const MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys'
const CUSTOM_SCHEMA = `${MEDIA_KEYS_SCHEMA}.custom-keybinding`
const PATH_PREFIX = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/'

type Entry = { slug: string; name: string; accelerator: string; args: string[] }

export type ShortcutHandlers = {
  showWindow: () => void
  sendAction: (action: ShortcutAction) => void
}

const GNOME_KEY_NAMES: Record<string, string> = {
  space: 'space',
  return: 'Return',
  enter: 'Return',
  tab: 'Tab',
  esc: 'Escape',
  escape: 'Escape',
  backspace: 'BackSpace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'Page_Up',
  pagedown: 'Page_Down',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  plus: 'plus',
  '-': 'minus'
}

export function toGnomeBinding(accelerator: string): string | null {
  const parts = accelerator.split('+').map((part) => part.trim())
  const key = parts.pop()
  if (!key || parts.length === 0) return null

  let modifiers = ''
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'ctrl':
      case 'control':
      case 'commandorcontrol':
        modifiers += '<Control>'
        break
      case 'alt':
        modifiers += '<Alt>'
        break
      case 'shift':
        modifiers += '<Shift>'
        break
      case 'super':
      case 'meta':
        modifiers += '<Super>'
        break
      default:
        return null
    }
  }

  const lower = key.toLowerCase()
  const gnomeKey = GNOME_KEY_NAMES[lower] ?? (key.length === 1 ? lower : key)
  return `${modifiers}${gnomeKey}`
}

async function gsettings(...args: string[]): Promise<string> {
  const { stdout } = await run('gsettings', args)
  return stdout.trim()
}

// The command GNOME runs is split like a shell line, so the path is double-quoted for that.
function shellQuote(value: string): string {
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`
}

// gsettings parses its value argument as GVariant text, so a string containing quotes or spaces
// has to be passed as a quoted GVariant string or it fails with "expected end of input".
function gvariantString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

async function applyGnome(entries: Entry[], executable: string): Promise<string | undefined> {
  const current = await gsettings('get', MEDIA_KEYS_SCHEMA, 'custom-keybindings')
  const paths = [...current.matchAll(/'([^']+)'/g)].map((match) => match[1])
  const ours = new Set(entries.map((entry) => `${PATH_PREFIX}${entry.slug}/`))
  const next = paths.filter((path) => !path.startsWith(`${PATH_PREFIX}note-taker-`))
  const warnings: string[] = []

  for (const entry of entries) {
    const path = `${PATH_PREFIX}${entry.slug}/`
    const schemaPath = `${CUSTOM_SCHEMA}:${path}`
    if (!entry.accelerator) {
      // Unset: leave the entry out of the list and blank its binding.
      await gsettings('reset', schemaPath, 'binding').catch(() => undefined)
      continue
    }

    const binding = toGnomeBinding(entry.accelerator)
    if (!binding) {
      warnings.push(`"${entry.accelerator}" is not a valid shortcut`)
      continue
    }

    const command = [shellQuote(executable), ...entry.args].join(' ')
    await gsettings('set', schemaPath, 'name', gvariantString(entry.name))
    await gsettings('set', schemaPath, 'command', gvariantString(command))
    await gsettings('set', schemaPath, 'binding', gvariantString(binding))
    next.push(path)
  }

  // Drop any of our paths that ended up unused so GNOME's list stays clean.
  const final = next.filter(
    (path) => !path.startsWith(`${PATH_PREFIX}note-taker-`) || ours.has(path)
  )
  const literal = `[${final.map((path) => `'${path}'`).join(', ')}]`
  await gsettings('set', MEDIA_KEYS_SCHEMA, 'custom-keybindings', literal)
  return warnings.length ? warnings.join('; ') : undefined
}

function applyElectron(entries: Entry[], handlers: ShortcutHandlers): string | undefined {
  const failed: string[] = []
  for (const entry of entries) {
    if (!entry.accelerator) continue
    const handler = entry.args.includes('--toggle-meeting')
      ? () => {
          handlers.showWindow()
          handlers.sendAction('toggle-meeting')
        }
      : () => handlers.showWindow()
    try {
      if (!globalShortcut.register(entry.accelerator, handler)) failed.push(entry.accelerator)
    } catch {
      failed.push(entry.accelerator)
    }
  }
  return failed.length ? `Could not register: ${failed.join(', ')}` : undefined
}

// mode "save" rewrites GNOME's keybinding list (it persists after the app quits). mode "startup"
// only re-registers Electron's own shortcuts, which die with the process.
export async function applyShortcuts(
  shortcuts: Shortcuts,
  handlers: ShortcutHandlers,
  opts: { mode: 'save' | 'startup'; packaged: boolean }
): Promise<string | undefined> {
  globalShortcut.unregisterAll()

  const entries: Entry[] = [
    {
      slug: 'note-taker-launch',
      name: 'Note Taker: open app',
      accelerator: shortcuts.launchApp,
      args: []
    },
    {
      slug: 'note-taker-toggle',
      name: 'Note Taker: start/stop meeting',
      accelerator: shortcuts.toggleMeeting,
      args: ['--toggle-meeting']
    }
  ]

  const onGnome =
    process.platform === 'linux' && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP ?? '')
  // A dev run's executable is the bare Electron binary, which a keybinding cannot usefully launch.
  if (onGnome && opts.packaged) {
    if (opts.mode === 'startup') return undefined
    try {
      return await applyGnome(entries, process.execPath)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const fallback = applyElectron(entries, handlers)
      return `GNOME keybinding failed (${reason}).${fallback ? ` ${fallback}` : ''}`
    }
  }

  return applyElectron(entries, handlers)
}
