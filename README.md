# PerFlux
```
██████╗ ███████╗██████╗ ███████╗██╗     ██╗   ██╗██╗  ██╗
██╔══██╗██╔════╝██╔══██╗██╔════╝██║     ██║   ██║╚██╗██╔╝
██████╔╝█████╗  ██████╔╝█████╗  ██║     ██║   ██║ ╚███╔╝ 
██╔═══╝ ██╔══╝  ██╔══██╗██╔══╝  ██║     ██║   ██║ ██╔██╗ 
██║     ███████╗██║  ██║██║     ███████╗╚██████╔╝██╔╝ ██╗
╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝
  ─────────────────────────────────────────────────────────
        A Lumiverse Spindle Extension  •  by Simplefan
  ─────────────────────────────────────────────────────────
```

Spindle extension for Lumiverse that adds a **PerFlux** tab for generating Pollinations images.

## Install
1. Push this folder to a public GitHub repo.
2. In Lumiverse, open **Extensions**.
3. Install from the GitHub repo URL.
4. Enable the extension.

## Notes
- The manifest is at the repository root as required by Spindle.
- `requested_capabilities` uses `dynamic_code_execution` and `base64_decode`, matching current manifest guidance.
- The backend first tries `spindle.enclave.get('POLLINATIONS_API')` and then `spindle.enclave.get('POLINATIONS_API')` so it can reuse an existing saved secret if present.
- If no saved secret exists, the UI accepts a user-entered API key for the current session only.

## Build
```bash
bun install
bun run build
```

## File layout
- `spindle.json`
- `src/backend.ts`
- `src/frontend.ts`
- `dist/backend.js`
- `dist/frontend.js`
