// @bun
// src/backend.ts
var STYLE_TAGS = {
  "Photo-realistic": "photorealistic, ultra-detailed, realistic lighting",
  vintage: "vintage style, retro tones, nostalgic aesthetic",
  "3d": "3d render, volumetric lighting, highly detailed",
  cartoon: "cartoon style, illustrated, bold outlines"
};
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var ENCLAVE_KEY = "pollinations_api_key";
function looksLikeBooruTags(prompt) {
  const fragments = prompt.split(",").map((f) => f.trim()).filter(Boolean);
  if (fragments.length < 2)
    return false;
  const tagLike = fragments.filter((f) => !/\s/.test(f) || f.split(" ").length <= 2);
  return tagLike.length / fragments.length > 0.6;
}
async function normalizePrompt(prompt, resolvedKey) {
  if (!looksLikeBooruTags(prompt))
    return prompt;
  try {
    const response = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolvedKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "Rewrite Danbooru/booru-style comma-separated image tags as a single natural-language image description. Keep every visual detail from the tags. Output only the rewritten description, no preamble, no quotes."
          },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok)
      return prompt;
    const data = await response.json();
    const rewritten = data?.choices?.[0]?.message?.content?.trim();
    return rewritten || prompt;
  } catch {
    return prompt;
  }
}
async function resolveApiKey(request, userId) {
  if (request.apiKey) {
    await spindle.enclave.put(ENCLAVE_KEY, request.apiKey, userId);
    return request.apiKey;
  }
  const stored = await spindle.enclave.get(ENCLAVE_KEY, userId);
  if (stored)
    return stored;
  throw new Error("No Pollinations API key saved yet. Add one in PerFlux settings.");
}
async function generateOne(request, index, userId, resolvedKey) {
  const finalPrompt = `${request.prompt.trim()}, ${STYLE_TAGS[request.style]}`;
  const seed = Number.isFinite(request.seed) ? Number(request.seed) : Math.floor(Math.random() * 1e9) + index;
  const url = new URL("https://image.pollinations.ai/prompt/" + encodeURIComponent(finalPrompt));
  url.searchParams.set("model", "zimage");
  url.searchParams.set("seed", String(seed));
  url.searchParams.set("nologo", "true");
  url.searchParams.set("private", "true");
  url.searchParams.set("enhance", "true");
  url.searchParams.set("safe", "false");
  url.searchParams.set("nsfw", "true");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${resolvedKey}`,
      Accept: "image/jpeg"
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(`Pollinations request failed (${response.status}): ${detail || response.statusText}`);
    err.status = response.status;
    throw err;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0;i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  return {
    index,
    seed,
    prompt: finalPrompt,
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`
  };
}
async function generateOneWithRetry(request, index, userId, resolvedKey, retries = 4, baseDelay = 2000) {
  try {
    return await generateOne(request, index, userId, resolvedKey);
  } catch (error) {
    if (error?.status === 429 && retries > 0) {
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;
      spindle.log?.warn?.(`Rate limited on image ${index}, retrying in ${(delay / 1000).toFixed(1)}s`);
      await sleep(delay);
      return generateOneWithRetry(request, index, userId, resolvedKey, retries - 1, baseDelay * 2);
    }
    throw error;
  }
}
spindle.onFrontendMessage(async (raw, userId) => {
  if (!raw)
    return;
  if (raw.type === "perflux:save-key") {
    await spindle.enclave.put(ENCLAVE_KEY, raw.apiKey, userId);
    spindle.sendToFrontend({ type: "perflux:key-saved" }, userId);
    return;
  }
  if (raw.type === "perflux:check-key") {
    const hasKey = await spindle.enclave.has(ENCLAVE_KEY, userId);
    spindle.sendToFrontend({ type: "perflux:key-status", hasKey }, userId);
    return;
  }
  if (raw.type !== "perflux:generate")
    return;
  try {
    const count = Math.max(1, Math.min(6, Number(raw.request.count || 1)));
    const resolvedKey = await resolveApiKey(raw.request, userId);
    const normalizedPrompt = await normalizePrompt(raw.request.prompt.trim(), resolvedKey);
    const generateRequest = { ...raw.request, prompt: normalizedPrompt };
    spindle.sendToFrontend({ type: "perflux:status", status: "loading", count }, userId);
    const images = [];
    for (let index = 0;index < count; index++) {
      const image = await generateOneWithRetry(generateRequest, index, userId, resolvedKey);
      images.push(image);
      spindle.sendToFrontend({ type: "perflux:progress", completed: index + 1, count }, userId);
      if (index < count - 1)
        await sleep(500);
    }
    spindle.sendToFrontend({ type: "perflux:results", images }, userId);
  } catch (error) {
    spindle.sendToFrontend({
      type: "perflux:error",
      message: error?.message || "Image generation failed."
    }, userId);
  }
});
