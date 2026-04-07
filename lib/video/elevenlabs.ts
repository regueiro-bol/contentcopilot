/**
 * lib/video/elevenlabs.ts — Text-to-speech vía ElevenLabs.
 *
 * Devuelve un Buffer MP3 con la narración. Si la API falla, lanza error.
 */

const ELEVEN_API = 'https://api.elevenlabs.io/v1/text-to-speech'

/**
 * Normaliza el valor de una env var de ElevenLabs.
 * Protege contra valores mal pegados como "NOMBRE=valor" en el dashboard
 * de Vercel: solo recorta el prefijo si es un identificador tipo ENV_VAR=.
 */
function cleanEnv(raw: string | undefined): string {
  if (!raw) return ''
  const v = raw.trim()
  // Strip only if the prefix is a valid env var name (uppercase + underscore)
  const m = v.match(/^[A-Z][A-Z0-9_]*=(.*)$/s)
  return (m ? m[1] : v).trim()
}

// Bella multilingual (voz española)
const FALLBACK_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const envVoice = cleanEnv(process.env.ELEVENLABS_DEFAULT_VOICE_ID)
export const DEFAULT_VOICE_ID = /^[A-Za-z0-9]{20}$/.test(envVoice)
  ? envVoice
  : FALLBACK_VOICE_ID

export async function synthesizeSpeech(params: {
  text: string
  voiceId?: string
}): Promise<Buffer> {
  const apiKey = cleanEnv(process.env.ELEVENLABS_API_KEY)
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurada')

  const voice = (params.voiceId || DEFAULT_VOICE_ID).trim()

  const res = await fetch(`${ELEVEN_API}/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: params.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const shape = `len=${apiKey.length} prefix=${apiKey.slice(0, 6)} suffix=${apiKey.slice(-4)} voice=${voice}`
    throw new Error(`ElevenLabs error ${res.status} [${shape}]: ${body.slice(0, 200)}`)
  }

  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}
