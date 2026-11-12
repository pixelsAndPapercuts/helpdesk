import { Logger } from '@nestjs/common'
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Speaker, TranscriptSegment } from './call-transcript.entity'
import { ffmpeg } from './merge-recording'

export type TranscribeProvider = 'deepgram' | 'sarvam'

export const TRANSCRIBE_MODELS: Record<TranscribeProvider, string> = {
  deepgram: 'nova-3',
  sarvam: 'saaras:v4',
}

export const TRANSCRIBE_RETRY = {
  attempts: 3,
  delaysMs: [5_000, 15_000],
}

export const DEEPGRAM_SUMMARY_MODEL = 'summarize-v2'

const logger = new Logger('Transcribe')

const CHANNEL_SPEAKER: Speaker[] = ['CLIENT', 'CONSULTANT'] // channel 0 = left, 1 = right

export class TranscribeError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message)
  }
}

export interface TranscribeResult {
  segments: TranscriptSegment[]
  summary: string | null
  model: string
}

export async function transcribe(
  provider: TranscribeProvider,
  file: string,
  contentType: string,
  withSummary: boolean,
): Promise<TranscribeResult> {
  const result =
    provider === 'sarvam'
      ? { segments: await withSarvam(file), summary: null }
      : await withDeepgram(file, contentType, withSummary)
  return { ...result, model: TRANSCRIBE_MODELS[provider] }
}

async function withRetry<T>(name: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (e) {
      const giveUp = !(e instanceof TranscribeError && e.retryable) || attempt >= TRANSCRIBE_RETRY.attempts
      if (giveUp) throw e
      const wait = TRANSCRIBE_RETRY.delaysMs[attempt - 1] ?? TRANSCRIBE_RETRY.delaysMs.at(-1) ?? 0
      logger.warn(`${name}: try ${attempt} of ${TRANSCRIBE_RETRY.attempts} failed (${e.message}) — trying again in ${wait / 1000} s`)
      await sleep(wait)
    }
  }
}

function networkError(name: string, e: unknown) {
  const err = e as Error & { cause?: { code?: string; message?: string } }
  const why = err.cause?.code ?? err.cause?.message
  return new TranscribeError(`Could not reach ${name}: ${err.message}${why ? ` (${why})` : ''}`, true)
}

async function httpError(name: string, res: Response) {
  const detail = await res.text().catch(() => '')
  const retryable = res.status === 408 || res.status === 429 || res.status >= 500
  return new TranscribeError(`${name} answered ${res.status}: ${detail.slice(0, 200)}`, retryable)
}

// ── Deepgram ──

const DEEPGRAM_PARAMS = {
  model: TRANSCRIBE_MODELS.deepgram,
  language: 'en',
  multichannel: 'true',
  utterances: 'true',
  smart_format: 'true',
}

interface DeepgramResponse {
  results?: {
    utterances?: { channel: number; start: number; end: number; transcript: string }[]
    summary?: { result: string; short?: string }
  }
}

async function withDeepgram(file: string, contentType: string, withSummary: boolean) {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) throw new TranscribeError('DEEPGRAM_API_KEY is not set')
  const query = new URLSearchParams({ ...DEEPGRAM_PARAMS, ...(withSummary && { summarize: 'v2' }) })
  const body = await readFile(file)
  return withRetry('Deepgram', () => deepgramOnce(query, key, contentType, body))
}

async function deepgramOnce(
  query: URLSearchParams,
  key: string,
  contentType: string,
  body: Uint8Array<ArrayBuffer>,
): Promise<{ segments: TranscriptSegment[]; summary: string | null }> {
  let res: Response
  try {
    res = await fetch(`https://api.deepgram.com/v1/listen?${query}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': contentType },
      body,
      signal: AbortSignal.timeout(5 * 60_000),
    })
  } catch (e) {
    throw networkError('Deepgram', e)
  }
  if (!res.ok) throw await httpError('Deepgram', res)

  const data = (await res.json()) as DeepgramResponse
  const segments = (data.results?.utterances ?? [])
    .filter((u) => u.transcript.trim())
    .map((u) => ({
      speaker: CHANNEL_SPEAKER[u.channel] ?? 'CLIENT',
      start: round(u.start),
      end: round(u.end),
      text: u.transcript.trim(),
    }))
    .sort((a, b) => a.start - b.start)
  const s = data.results?.summary
  return { segments, summary: s?.result === 'success' && s.short?.trim() ? s.short.trim() : null }
}

// ── Sarvam ──
// Sarvam's REST API takes up to 30 s of mono audio and its timestamps are too coarse to rely on.
// So we find the speech in each channel ourselves (ffmpeg silencedetect), send each stretch on its
// own, and use our own cut points as the line times. The channel still tells us who is speaking.

const SARVAM_URL = 'https://api.sarvam.ai/speech-to-text'
const SARVAM_LANGUAGE = 'unknown' // auto-detect, so Hindi and other Indian languages work too
const SARVAM_MAX_SECONDS = 25
const SARVAM_PARALLEL = 4
const SILENCE = { noise: '-40dB', minSeconds: 0.6, padSeconds: 0.2 }

interface SarvamPiece {
  speaker: Speaker
  channel: number
  start: number
  end: number
}

async function withSarvam(file: string): Promise<TranscriptSegment[]> {
  const key = process.env.SARVAM_API_KEY
  if (!key) throw new TranscribeError('SARVAM_API_KEY is not set')

  const pieces: SarvamPiece[] = []
  for (const channel of [0, 1]) {
    for (const [start, end] of await speechIn(file, channel)) {
      for (let s = start; s < end; s += SARVAM_MAX_SECONDS) {
        pieces.push({ speaker: CHANNEL_SPEAKER[channel], channel, start: s, end: Math.min(end, s + SARVAM_MAX_SECONDS) })
      }
    }
  }

  const dir = path.join(path.dirname(file), 'stt-pieces')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir)
  try {
    const results = await inParallel(pieces, SARVAM_PARALLEL, async (piece, i) => {
      const wav = path.join(dir, `${i}.wav`)
      await ffmpeg([
        '-ss', String(piece.start), '-t', String(piece.end - piece.start), '-i', file,
        '-af', `pan=mono|c0=c${piece.channel}`, '-ar', '16000', '-c:a', 'pcm_s16le', wav,
      ])
      const text = await withRetry('Sarvam', () => sarvamOnce(key, wav))
      return text ? { speaker: piece.speaker, start: round(piece.start), end: round(piece.end), text } : null
    })
    return results.filter((s): s is TranscriptSegment => s !== null).sort((a, b) => a.start - b.start)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** [start, end] of each stretch of speech in one channel, in seconds. */
async function speechIn(file: string, channel: number): Promise<[number, number][]> {
  const log = await new Promise<string>((resolve, reject) =>
    execFile(
      ffmpegPath!,
      ['-hide_banner', '-nostats', '-i', file, '-af',
        `pan=mono|c0=c${channel},silencedetect=noise=${SILENCE.noise}:d=${SILENCE.minSeconds}`, '-f', 'null', '-'],
      { timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      (err, _out, stderr) => (err ? reject(new Error(`ffmpeg failed: ${err.message}`)) : resolve(stderr)),
    ),
  )
  const hms = log.match(/Duration: (\d+):(\d+):([\d.]+)/)
  const duration = hms ? +hms[1] * 3600 + +hms[2] * 60 + +hms[3] : Infinity
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1])
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1])

  const speech: [number, number][] = []
  let from = 0
  starts.forEach((silenceStart, i) => {
    if (silenceStart > from) speech.push([from, silenceStart])
    from = ends[i] ?? Infinity
  })
  if (from < duration && duration !== Infinity) speech.push([from, duration])

  return speech
    .map(([s, e]): [number, number] => [Math.max(0, s - SILENCE.padSeconds), Math.min(duration, e + SILENCE.padSeconds)])
    .filter(([s, e]) => e - s >= 0.3)
}

async function sarvamOnce(key: string, wav: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([await readFile(wav)], { type: 'audio/wav' }), 'piece.wav')
  form.append('model', TRANSCRIBE_MODELS.sarvam)
  form.append('language_code', SARVAM_LANGUAGE)

  let res: Response
  try {
    res = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': key },
      body: form,
      signal: AbortSignal.timeout(2 * 60_000),
    })
  } catch (e) {
    throw networkError('Sarvam', e)
  }
  if (!res.ok) throw await httpError('Sarvam', res)
  return (((await res.json()) as { transcript?: string }).transcript ?? '').trim()
}

async function inParallel<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await run(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const round = (s: number) => Math.round(s * 100) / 100
