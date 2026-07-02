import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

type BackendMessage =
  | { type: 'perflux:status'; status: 'loading'; count: number }
  | { type: 'perflux:progress'; completed: number; count: number }
  | { type: 'perflux:results'; images: Array<{ index: number; seed: number; prompt: string; mimeType: string; dataUrl: string }> }
  | { type: 'perflux:error'; message: string }
  | { type: 'perflux:key-saved' }
  | { type: 'perflux:key-status'; hasKey: boolean }

const STYLE_OPTIONS = ['Photo-realistic', 'vintage', '3d', 'cartoon'] as const

export function setup(ctx: SpindleFrontendContext) {
  const removeStyle = ctx.dom.addStyle(`
    .perflux-shell{padding:16px;color:var(--lumiverse-text,inherit);height:100%;overflow:auto}
    .perflux-card{background:var(--lumiverse-fill-subtle);border:1px solid var(--lumiverse-border);border-radius:var(--lumiverse-radius);padding:16px;display:grid;gap:12px}
    .perflux-title{font-size:20px;font-weight:700;margin:0}
    .perflux-sub{font-size:12px;color:var(--lumiverse-text-muted)}
    .perflux-grid{display:grid;gap:12px}
    .perflux-row{display:grid;grid-template-columns:1fr 160px 120px 140px;gap:12px;align-items:end}
    .perflux-field{display:grid;gap:6px}
    .perflux-label{font-size:12px;color:var(--lumiverse-text-muted)}
    .perflux-key-hint{font-size:11px;color:var(--lumiverse-text-dim)}
    .perflux-textarea,.perflux-input,.perflux-select{width:100%;background:var(--lumiverse-fill);color:var(--lumiverse-text,inherit);border:1px solid var(--lumiverse-border);border-radius:var(--lumiverse-radius);padding:10px 12px}
    .perflux-textarea{min-height:150px;resize:vertical}
    .perflux-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .perflux-btn{padding:10px 18px;border-radius:var(--lumiverse-radius);background:var(--lumiverse-accent, #4f46e5);color:white;border:none;font-weight:600}
    .perflux-status{font-size:13px;color:var(--lumiverse-text-muted);min-height:20px}
    .perflux-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .perflux-item{background:var(--lumiverse-fill-subtle);border:1px solid var(--lumiverse-border);border-radius:calc(var(--lumiverse-radius) + 2px);overflow:hidden}
    .perflux-frame{aspect-ratio:1/1;background:var(--lumiverse-fill);display:grid;place-items:center;position:relative;cursor:zoom-in}
    .perflux-frame img{width:100%;height:100%;object-fit:cover;display:block}
    .perflux-meta{padding:10px;display:grid;gap:8px}
    .perflux-seed{font-size:12px;color:var(--lumiverse-text-muted)}
    .perflux-download{display:inline-flex;justify-content:center;align-items:center;padding:8px 10px;border:1px solid var(--lumiverse-border);border-radius:var(--lumiverse-radius);text-decoration:none;color:inherit;background:transparent}
    .perflux-skeleton{width:100%;height:100%;background:linear-gradient(90deg,var(--lumiverse-fill-subtle) 25%,var(--lumiverse-fill) 50%,var(--lumiverse-fill-subtle) 75%);background-size:200% 100%;animation:perflux-shimmer 1.3s infinite}
    .perflux-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:24px;z-index:9999}
    .perflux-lightbox.open{display:flex}
    .perflux-lightbox img{max-width:min(92vw,1200px);max-height:90vh;border-radius:12px}
    .perflux-close{position:absolute;top:18px;right:18px;background:rgba(255,255,255,.16);color:white;border:1px solid rgba(255,255,255,.24);border-radius:999px;padding:10px 12px}
    @keyframes perflux-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @media (max-width: 900px){.perflux-row{grid-template-columns:1fr 1fr}.perflux-row .perflux-field:first-child{grid-column:1/-1}}
    @media (max-width: 560px){.perflux-row{grid-template-columns:1fr}}
  `)

  const tab = ctx.ui.registerDrawerTab({
    id: 'perflux',
    title: 'PerFlux',
    shortName: 'PerFlux',
    description: 'Flux image generation through Pollinations',
    keywords: ['flux', 'image', 'pollinations', 'generator'],
    headerTitle: 'PerFlux',
    iconSvg: '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2L12.6 7.4L18 10L12.6 12.6L10 18L7.4 12.6L2 10L7.4 7.4L10 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  })

  const shell = document.createElement('div')
  shell.className = 'perflux-shell'
  shell.innerHTML = `
    <div class="perflux-card">
      <h2 class="perflux-title">PerFlux</h2>
      <div class="perflux-sub">Flux image generation through Pollinations.</div>
      <div class="perflux-grid">
        <div class="perflux-field">
          <label class="perflux-label" for="perflux-prompt">Prompt</label>
          <textarea id="perflux-prompt" class="perflux-textarea" placeholder="Describe the image you want to generate"></textarea>
        </div>
        <div class="perflux-row">
          <div class="perflux-field">
            <label class="perflux-label" for="perflux-seed">Seed</label>
            <input id="perflux-seed" class="perflux-input" type="number" placeholder="Optional seed" />
          </div>
          <div class="perflux-field">
            <label class="perflux-label" for="perflux-style">Style</label>
            <select id="perflux-style" class="perflux-select">
              ${STYLE_OPTIONS.map((option) => `<option value="${option}">${option}</option>`).join('')}
            </select>
          </div>
          <div class="perflux-field">
            <label class="perflux-label" for="perflux-count">Photos</label>
            <select id="perflux-count" class="perflux-select">
              ${Array.from({ length: 6 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
            </select>
          </div>
          <div class="perflux-field">
            <label class="perflux-label" for="perflux-key">API key</label>
            <input id="perflux-key" class="perflux-input" type="password" placeholder="Paste to save" />
          </div>
        </div>
        <div id="perflux-key-hint" class="perflux-key-hint">Checking saved key…</div>
        <div class="perflux-actions">
          <button id="perflux-generate" class="perflux-btn" type="button">Generate</button>
          <div id="perflux-status" class="perflux-status"></div>
        </div>
        <div id="perflux-gallery" class="perflux-gallery"></div>
      </div>
    </div>
    <div id="perflux-lightbox" class="perflux-lightbox" aria-hidden="true">
      <button id="perflux-close" class="perflux-close" aria-label="Close image preview" type="button">Close</button>
      <img id="perflux-lightbox-image" alt="Generated image preview" />
    </div>
  `

  tab.root.replaceChildren(shell)

  const promptEl = shell.querySelector('#perflux-prompt') as HTMLTextAreaElement | null
  const seedEl = shell.querySelector('#perflux-seed') as HTMLInputElement | null
  const styleEl = shell.querySelector('#perflux-style') as HTMLSelectElement | null
  const countEl = shell.querySelector('#perflux-count') as HTMLSelectElement | null
  const keyEl = shell.querySelector('#perflux-key') as HTMLInputElement | null
  const keyHintEl = shell.querySelector('#perflux-key-hint') as HTMLDivElement | null
  const buttonEl = shell.querySelector('#perflux-generate') as HTMLButtonElement | null
  const statusEl = shell.querySelector('#perflux-status') as HTMLDivElement | null
  const galleryEl = shell.querySelector('#perflux-gallery') as HTMLDivElement | null
  const lightboxEl = shell.querySelector('#perflux-lightbox') as HTMLDivElement | null
  const lightboxImageEl = shell.querySelector('#perflux-lightbox-image') as HTMLImageElement | null
  const closeEl = shell.querySelector('#perflux-close') as HTMLButtonElement | null

  function setStatus(message: string) {
    if (statusEl) statusEl.textContent = message
  }

  function setKeyHint(hasKey: boolean) {
    if (!keyHintEl) return
    keyHintEl.textContent = hasKey
      ? 'A key is already saved. Leave this blank unless you want to replace it.'
      : 'No key saved yet — paste your Pollinations API key and generate once to save it.'
  }

  function clearGallery() {
    if (galleryEl) galleryEl.innerHTML = ''
  }

  function renderSkeletons(count: number) {
    clearGallery()
    if (!galleryEl) return
    galleryEl.innerHTML = Array.from({ length: count }, () => `
      <div class="perflux-item">
        <div class="perflux-frame"><div class="perflux-skeleton"></div></div>
        <div class="perflux-meta">
          <div class="perflux-skeleton" style="height:14px;border-radius:8px"></div>
          <div class="perflux-skeleton" style="height:32px;border-radius:8px"></div>
        </div>
      </div>
    `).join('')
  }

  function downloadDataUrl(dataUrl: string, filename: string) {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function renderImages(images: Array<{ index: number; seed: number; prompt: string; mimeType: string; dataUrl: string }>) {
    clearGallery()
    if (!galleryEl) return
    const fragment = document.createDocumentFragment()

    images.forEach((image, i) => {
      const item = document.createElement('div')
      item.className = 'perflux-item'
      item.innerHTML = `
        <div class="perflux-frame">
          <img src="${image.dataUrl}" alt="Generated image ${i + 1}" />
        </div>
        <div class="perflux-meta">
          <div class="perflux-seed">Seed: ${image.seed}</div>
          <button class="perflux-download" type="button">Download</button>
        </div>
      `
      const img = item.querySelector('img') as HTMLImageElement
      const btn = item.querySelector('.perflux-download') as HTMLButtonElement
      img.addEventListener('click', () => {
        if (lightboxEl && lightboxImageEl) {
          lightboxImageEl.src = image.dataUrl
          lightboxEl.classList.add('open')
          lightboxEl.setAttribute('aria-hidden', 'false')
        }
      })
      btn.addEventListener('click', () => downloadDataUrl(image.dataUrl, `perflux-${image.seed}.jpg`))
      fragment.appendChild(item)
    })

    galleryEl.appendChild(fragment)
    tab.setBadge(images.length ? String(images.length) : null)
  }

  const offMessage = ctx.onBackendMessage((message: BackendMessage) => {
    if (!message || typeof message !== 'object') return

    if (message.type === 'perflux:status') {
      setStatus(`Generating ${message.count} image${message.count === 1 ? '' : 's'}...`)
      tab.setBadge('…')
      renderSkeletons(message.count)
      return
    }
    if (message.type === 'perflux:progress') {
      setStatus(`Generated ${message.completed} of ${message.count}...`)
      return
    }
    if (message.type === 'perflux:results') {
      setStatus(`Generated ${message.images.length} image${message.images.length === 1 ? '' : 's'}.`)
      renderImages(message.images)
      // A key only reaches the backend once a generate call succeeds, so
      // this is a reliable point to refresh the "already saved" hint.
      if (keyEl) keyEl.value = ''
      ctx.sendToBackend({ type: 'perflux:check-key' })
      return
    }
    if (message.type === 'perflux:error') {
      setStatus(message.message)
      tab.setBadge(null)
      clearGallery()
      return
    }
    if (message.type === 'perflux:key-status') {
      setKeyHint(message.hasKey)
      return
    }
    if (message.type === 'perflux:key-saved') {
      setKeyHint(true)
      if (keyEl) keyEl.value = ''
    }
  })

  buttonEl?.addEventListener('click', () => {
    const prompt = promptEl?.value?.trim() || ''
    if (!prompt) {
      setStatus('Enter a prompt first.')
      tab.setBadge(null)
      clearGallery()
      return
    }

    const seedValue = seedEl?.value?.trim() || ''
    clearGallery()
    ctx.sendToBackend({
      type: 'perflux:generate',
      request: {
        prompt,
        style: (styleEl?.value || 'Photo-realistic') as typeof STYLE_OPTIONS[number],
        count: Number(countEl?.value || '1'),
        seed: seedValue ? Number(seedValue) : null,
        apiKey: keyEl?.value?.trim() || null
      }
    })
  })

  closeEl?.addEventListener('click', () => {
    if (lightboxEl) {
      lightboxEl.classList.remove('open')
      lightboxEl.setAttribute('aria-hidden', 'true')
    }
  })

  lightboxEl?.addEventListener('click', (event) => {
    if (event.target === lightboxEl) {
      lightboxEl.classList.remove('open')
      lightboxEl.setAttribute('aria-hidden', 'true')
    }
  })

  const offActivate = tab.onActivate(() => {
    tab.setBadge(null)
  })

  // Check once on load so the hint text is accurate before the user does anything.
  ctx.sendToBackend({ type: 'perflux:check-key' })

  return () => {
    offActivate()
    offMessage()
    tab.destroy()
    removeStyle()
    ctx.dom.cleanup()
  }
}
