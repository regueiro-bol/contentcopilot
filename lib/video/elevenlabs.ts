/**
 * lib/video/elevenlabs.ts — Text-to-speech vía ElevenLabs.
 *
 * Devuelve un Buffer MP3 con la narración. Si la API falla, lanza error.
 */

const ELEVEN_API = 'https://api.elevenlabs.io/v1/text-to-speech'

// Voice ID Sarah multilingual — hardcoded para garantizar una voz válida
// (la variable de entorno puede tener typos sutiles).
export const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaA'

export async function synthesizeSpeech(params: {
  text: string
  voiceId?: string
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY no configurada')

  const voice = params.voiceId || DEFAULT_VOICE_ID

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
    throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 300)}`)
  }

  const arr = await res.arrayBuffer()
  return Buffer.from(arr)
}
