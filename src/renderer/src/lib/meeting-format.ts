import type { Meeting, SummaryType } from '../../../shared/types'

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

export function groupUtterances(
  meeting: Meeting
): Array<{ speaker: number; start: number; text: string }> {
  if (!meeting.utterances?.length) return []

  const groups: Array<{ speaker: number; start: number; text: string }> = []

  for (const utterance of meeting.utterances) {
    const last = groups[groups.length - 1]
    if (last && last.speaker === utterance.speaker) {
      last.text = `${last.text} ${utterance.text}`.trim()
    } else {
      groups.push({
        speaker: utterance.speaker,
        start: utterance.start,
        text: utterance.text
      })
    }
  }

  return groups
}

export function getSummaryText(meeting: Meeting): string {
  return meeting.summary?.trim() || 'No summary available.'
}

export function speakerName(meeting: Meeting, speaker: number): string {
  return meeting.speakerNames?.[String(speaker)] || `Speaker ${speaker + 1}`
}

export function getTranscriptText(meeting: Meeting): string {
  if (meeting.utterances?.length) {
    return groupUtterances(meeting)
      .map(
        (group) =>
          `[${formatTimestamp(group.start)}] ${speakerName(meeting, group.speaker)}: ${group.text}`
      )
      .join('\n\n')
  }

  return meeting.fullTranscript?.trim() || 'No transcript available.'
}

export const SUMMARY_LABELS: Record<SummaryType, string> = {
  bullet_points: 'Bullet points',
  concise: 'Concise',
  general: 'General'
}

export const SUMMARY_TYPES: SummaryType[] = ['bullet_points', 'concise', 'general']

// Meetings saved before per-style summaries existed only have `summary`. Settings defaulted to
// bullet points, so that is the closest label for them.
export function getSummaryFor(meeting: Meeting, type: SummaryType): string | undefined {
  const stored = meeting.summaries?.[type]?.trim()
  if (stored) return stored
  if (!meeting.summaries && type === 'bullet_points') return meeting.summary?.trim() || undefined
  return undefined
}

export function meetingToMarkdown(meeting: Meeting): string {
  const lines = [
    `# ${meeting.title}`,
    '',
    `${new Date(meeting.createdAt).toLocaleString()} · ${formatDuration(meeting.durationMs)}`,
    ''
  ]

  for (const type of SUMMARY_TYPES) {
    const text = getSummaryFor(meeting, type)
    if (text) lines.push(`## Summary — ${SUMMARY_LABELS[type]}`, '', text, '')
  }

  lines.push('## Transcript', '', getTranscriptText(meeting), '')
  return lines.join('\n')
}

export function downloadTextFile(filename: string, text: string): void {
  if (window.api.capabilities.nativeShare && window.api.shareText) {
    void window.api.shareText(filename, text)
    return
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
