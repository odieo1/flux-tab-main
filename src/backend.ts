declare const spindle: import('lumiverse-spindle-types').SpindleAPI

type GenerateRequest = {
  prompt: string
  style: 'Photo-realistic' | 'vintage' | '3d' | 'cartoon'
  count: number
  seed?: number | null
  apiKey?: string | null
}

type FrontendEnvelope = {
  type: 'perflux:generate'
  request: GenerateRequest
}

const STYLE_TAGS: Record<GenerateRequest['style'], string> = {
  'Photo-realistic': 'photorealistic, ultra-detailed, realistic lighting',
  'vintage': 'vintage style, retro tones, nostalgic aesthetic',
  '3d': '3d render, volumetric lighting, highly detailed',
  'cartoon': 'cartoon style, illustrated, bold outlines'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const ENCLAVE_KEY = 'pollinations_api_key'

// Reads the key from the Secure Enclave (per-user encrypted store). Falls back
// to persisting a key sent from the frontend settings field, if provided, so
// the first save also works without a separate round trip.
async function resolveApiKey(request: GenerateRequest, userId: string): Promise<string> {
  if (request.apiKey) {
    await spindle.enclave.put(ENCLAVE_KEY, request.apiKey, userId)
    return request.apiKey
  }
  const stored = await spindle.enclave.get(ENCLAVE_KEY, userId)
  if (stored) return stored
  throw new Error('No Pollinations API key saved yet. Add one in PerFlux settings.')
}

async function generateOne(
  request: GenerateRequest,
  index: number,
  userId: string,
  resolvedKey: string
) {
  const finalPrompt = `${request.prompt.trim()}, ${STYLE_TAGS[request.style]}`
  const seed = Number.isFinite(request.seed as number)
    ? Number(request.seed)
    : Math.floor(Math.random() * 1000000000) + index

  const url = new URL('https://image.pollinations.ai/prompt/' + encodeURIComponent(finalPrompt))
  url.searchParams.set('model', 'flux')
  url.searchParams.set('seed', String(seed))
  url.searchParams.set('nologo', 'true')
  url.searchParams.set('private', 'true')
  url.searchParams.set('enhance', 'false')
  url.searchParams.set('safe', 'false')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      Accept: 'image/jpeg'
    }
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const err: any = new Error(`Pollinations request failed (${response.status}): ${detail || response.statusText}`)
    err.status = response.status
    throw err
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  const mimeType = response.headers.get('content-type') || 'image/jpeg'

  return {
    index,
    seed,
    prompt: finalPrompt,
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`
  }
}

async function generateOneWithRetry(
  request: GenerateRequest,
  index: number,
  userId: string,
  resolvedKey: string,
  retries = 4,
  baseDelay = 2000
): Promise<ReturnType<typeof generateOne>> {
  try {
    return await generateOne(request, index, userId, resolvedKey)
  } catch (error: any) {
    if (error?.status === 429 && retries > 0) {
      const jitter = Math.random() * 1000
      const delay = baseDelay + jitter
      spindle.log?.warn?.(`Rate limited on image ${index}, retrying in ${(delay / 1000).toFixed(1)}s`)
      await sleep(delay)
      return generateOneWithRetry(request, index, userId, resolvedKey, retries - 1, baseDelay * 2)
    }
    throw error
  }
}

type SaveKeyEnvelope = { type: 'perflux:save-key'; apiKey: string }
type CheckKeyEnvelope = { type: 'perflux:check-key' }

// Signature confirmed from Lumiverse's own examples: (payload, userId) — userId
// is the second argument directly, NOT a `.userId` property on it.
spindle.onFrontendMessage(async (raw: FrontendEnvelope | SaveKeyEnvelope | CheckKeyEnvelope, userId: string) => {
  if (!raw) return

  if (raw.type === 'perflux:save-key') {
    await spindle.enclave.put(ENCLAVE_KEY, raw.apiKey, userId)
    spindle.sendToFrontend({ type: 'perflux:key-saved' }, userId)
    return
  }

  if (raw.type === 'perflux:check-key') {
    const hasKey = await spindle.enclave.has(ENCLAVE_KEY, userId)
    spindle.sendToFrontend({ type: 'perflux:key-status', hasKey }, userId)
    return
  }

  if (raw.type !== 'perflux:generate') return

  try {
    const count = Math.max(1, Math.min(6, Number(raw.request.count || 1)))
    const resolvedKey = await resolveApiKey(raw.request, userId)

    spindle.sendToFrontend({ type: 'perflux:status', status: 'loading', count }, userId)

    // Sequential, not parallel — this is what was tripping Pollinations' quota.
    // A small gap between calls on top of the retry/backoff gives extra headroom.
    const images = []
    for (let index = 0; index < count; index++) {
      const image = await generateOneWithRetry(raw.request, index, userId, resolvedKey)
      images.push(image)
      spindle.sendToFrontend({ type: 'perflux:progress', completed: index + 1, count }, userId)
      if (index < count - 1) await sleep(500)
    }

    spindle.sendToFrontend({ type: 'perflux:results', images }, userId)
  } catch (error: any) {
    spindle.sendToFrontend({
      type: 'perflux:error',
      message: error?.message || 'Image generation failed.'
    }, userId)
  }
})

