import { execFile } from 'node:child_process'
import { access, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

export interface MergedRecording {
  file: string
  audioFile: string
}

// Playback mixes both voices into both ears; the audio file for transcription keeps them apart.
const BOTH_EARS = 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1'
const FIX_TIMING = 'aresample=async=1'

export async function mergeRecording(dir: string, parts: number): Promise<MergedRecording> {
  if (!ffmpegPath) throw new Error('ffmpeg is not available on this machine')

  const ext = (await exists(path.join(dir, 'part-1.webm'))) ? 'webm' : 'mp4'
  const files: string[] = []
  for (let n = 1; n <= parts; n++) {
    const file = path.resolve(dir, `part-${n}.${ext}`)
    if (await exists(file)) files.push(file)
  }
  if (!files.length) throw new Error('No recording files found')

  const list = path.join(dir, 'parts.txt')
  await writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))

  const webm = ext === 'webm'
  const out = { file: webm ? 'call.webm' : 'call.mp4', audioFile: webm ? 'call-audio.webm' : 'call-audio.m4a' }
  const audioCodec = webm ? ['-c:a', 'libopus', '-b:a', '64k'] : ['-c:a', 'aac', '-b:a', '96k']
  const run = (video: string[]) =>
    ffmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-map', '0:v', '-map', '0:a', ...video, '-af', `${FIX_TIMING},${BOTH_EARS}`, ...audioCodec,
      path.join(dir, out.file),
      '-map', '0:a', '-vn', '-af', FIX_TIMING, ...audioCodec,
      path.join(dir, out.audioFile),
    ])

  try {
    await run(['-c:v', 'copy'])
  } catch {
    await run(webm ? ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1M'] : ['-c:v', 'libx264', '-preset', 'veryfast'])
  }
  return out
}

export function audioFileFor(playbackFile: string): { file: string; type: string } {
  return playbackFile.endsWith('.mp4')
    ? { file: 'call-audio.m4a', type: 'audio/mp4' }
    : { file: 'call-audio.webm', type: 'audio/webm' }
}

export function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath!, ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 10 * 60_000 }, (err, _out, stderr) =>
      err ? reject(new Error(`ffmpeg failed: ${stderr.trim().split('\n').pop() ?? err.message}`)) : resolve(),
    )
  })
}

async function exists(file: string) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}
