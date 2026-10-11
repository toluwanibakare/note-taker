import { readFile } from 'fs/promises'
import { transcribeBlob } from '../shared/gladia-client'
import type { Utterance } from '../shared/types'

export async function transcribe(
  audioPath: string,
  apiKey: string,
  opts: { summaryType: string; language: string },
  onStatus: (status: string) => void
): Promise<{ summary: string; fullTranscript: string; utterances: Utterance[] }> {
  const ext = audioPath.split('.').pop()?.toLowerCase() ?? 'webm'
  const bytes = await readFile(audioPath)
  return transcribeBlob(new Blob([bytes]), ext, apiKey, opts, onStatus)
}
