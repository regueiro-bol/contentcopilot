/**
 * lib/video/compose.ts — Montaje final con ffmpeg.
 *
 * Recibe una lista de escenas (cada una con imagen o clip de vídeo, audio
 * y duración) y produce un MP4 en el formato pedido (9x16 o 16x9).
 *
 * Estrategia simple y robusta para serverless:
 *   1. Por cada escena, descargamos la imagen/clip y el audio a /tmp.
 *   2. Generamos un clip individual por escena con la duración del audio
 *      (o la duración solicitada si no hay audio), aplicando subtítulos.
 *   3. Concatenamos todos los clips con el demuxer concat.
 *
 * El binario ffmpeg viene de @ffmpeg-installer/ffmpeg.
 */

import path from 'node:path'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

export interface SceneInput {
  /** Imagen estática (PNG/JPG) o clip MP4. */
  visualUrl: string
  visualKind: 'image' | 'video'
  /** Audio MP3 con la narración (opcional). */
  audioUrl?: string | null
  /** Texto para subtítulos en pantalla. */
  caption?: string | null
  /** Duración mínima en segundos (si no hay audio). */
  durationSeconds: number
}

export type VideoFormat = '9x16' | '16x9'

const FORMAT_DIMS: Record<VideoFormat, { w: number; h: number }> = {
  '9x16': { w: 1080, h: 1920 },
  '16x9': { w: 1920, h: 1080 },
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(dest, buf)
}

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\u2019")
    .replace(/\n/g, ' ')
}

function buildVideoFilter(
  format: VideoFormat,
  _caption: string | null | undefined,
  _duration: number,
): string {
  const { w, h } = FORMAT_DIMS[format]
  // Solo scale + crop. Subtítulos requieren drawtext con fontfile,
  // y la lambda de Vercel no incluye fuentes del sistema.
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`
}

async function renderScene(params: {
  scene: SceneInput
  format: VideoFormat
  outPath: string
  workDir: string
  index: number
}): Promise<number> {
  const { scene, format, outPath, workDir, index } = params

  const visualExt = scene.visualKind === 'video' ? 'mp4' : 'jpg'
  const visualPath = path.join(workDir, `visual_${index}.${visualExt}`)
  await downloadTo(scene.visualUrl, visualPath)

  let audioPath: string | null = null
  if (scene.audioUrl) {
    audioPath = path.join(workDir, `audio_${index}.mp3`)
    await downloadTo(scene.audioUrl, audioPath)
  }

  const duration = Math.max(2, scene.durationSeconds || 5)
  const vf = buildVideoFilter(format, scene.caption, duration)

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg()

    if (scene.visualKind === 'image') {
      cmd = cmd.input(visualPath).inputOptions(['-loop 1'])
    } else {
      cmd = cmd.input(visualPath)
    }

    if (audioPath) {
      cmd = cmd.input(audioPath)
    }

    cmd
      .outputOptions([
        '-r 30',
        '-pix_fmt yuv420p',
        '-c:v libx264',
        '-preset veryfast',
        '-crf 23',
        `-t ${duration}`,
        '-movflags +faststart',
      ])
      .videoFilters(vf)

    if (audioPath) {
      cmd.outputOptions(['-c:a aac', '-b:a 128k', '-shortest'])
    } else {
      cmd.outputOptions(['-an'])
    }

    cmd.on('error', (err) => reject(err)).on('end', () => resolve()).save(outPath)
  })

  return duration
}

export async function buildVideo(params: {
  scenes: SceneInput[]
  format: VideoFormat
  outFileName: string
}): Promise<Buffer> {
  const { scenes, format, outFileName } = params
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-'))

  try {
    const sceneFiles: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const out = path.join(workDir, `scene_${i}.mp4`)
      await renderScene({ scene: scenes[i], format, outPath: out, workDir, index: i })
      sceneFiles.push(out)
    }

    // Concat
    const listPath = path.join(workDir, 'list.txt')
    await fs.writeFile(
      listPath,
      sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
    )
    const finalPath = path.join(workDir, outFileName)
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy', '-movflags +faststart'])
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .save(finalPath)
    })

    const buf = await fs.readFile(finalPath)
    return buf
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
