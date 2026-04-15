// api/gemini.js

const STYLE_PROMPTS = {
  default: "ä½???¯ä??ä½?è¦ªå??ä¸?å°?æ¥­ç??å­¸ç????©æ?????Memo??©æ?????ï¼?èª?æ°?æº«æ??ï¼????é»????å¸?å¹³å?????",
  academic:
    "ä½???¯ä??ä½???´è¬¹?????????ï¼?è«?ä½¿ç?¨å¤§???å°?æ¥­è??èª?ï¼?çµ?æ§?æ¥µåº¦??´å??ï¼?ä¸¦å??å¼·é??è¼¯æ?¨æ?????å­¸è??æ·±åº¦???",
  minimalist:
    "ä½???¯ä??ä½?æ¥µç°¡ä¸»ç¾©ç­?è¨?å°?å®¶ï??è«???ªé?¤æ????????è©?è´???¥ï????ªä???????¸å??æ¦?å¿µè??è¡????æ¸???®ï?????å­?æ¥µåº¦ç²¾ç?????",
  storyteller:
    "ä½???¯ä??ä½??????·ç°¡???æ¦?å¿µç??å°?å¸«ï??è«?ä½¿ç?¨æ·ºé¡¯æ????????èª?è¨?ï¼?å¤???¨æ????»ä??è§????è¤????æ¦?å¿µï??è®?ç­?è¨???????äº?ä¸?æ¨?å¥½è?????",
};

const REQUEST_LIMIT_WINDOW_MS = 60 * 1000;
const REQUEST_LIMIT_MAX = 30;
const REQUEST_HARD_BLOCK_MAX = 120;
const PROMPT_MAX_LENGTH = 12000;
const SCHEMA_MAX_LENGTH = 50000;
const rateLimitBuckets = new Map();
const BOT_UA_PATTERN = /(bot|crawler|spider|scraper|curl|wget|python-requests|httpclient)/i;

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  return forwardedFor.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function isLocalDevelopmentRequest(req) {
  const host = String(req.headers.host || "").toLowerCase();
  const ip = String(getClientIp(req) || "").toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1") || host.includes("[::1]")) {
    return true;
  }
  if (ip === "127.0.0.1" || ip === "::1" || ip.endsWith(":127.0.0.1") || ip.endsWith(":0:0:0:0:0:0:0:1")) {
    return true;
  }
  return false;
}

function getRedisConfig() {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

async function redisCall(baseUrl, token, command, ...args) {
  const encoded = [command, ...args].map((v) => encodeURIComponent(String(v))).join("/");
  const url = `${baseUrl}/${encoded}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Redis command failed: ${command}`);
  }

  const data = await response.json();
  return data?.result;
}

async function sendSecurityAlert(payload) {
  const webhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Alert failures should never block API availability.
  }
}

function isBlockedUserAgent(req) {
  const userAgent = String(req.headers["user-agent"] || "");
  return !userAgent || BOT_UA_PATTERN.test(userAgent);
}

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function isContentTypeJson(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  return contentType.includes("application/json");
}

function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Invalid request body";
  }

  const { prompt, schema, aiStyle } = body;

  if (typeof prompt !== "string") {
    return "prompt must be a string";
  }
  if (prompt.length > PROMPT_MAX_LENGTH) {
    return `prompt exceeds ${PROMPT_MAX_LENGTH} characters`;
  }

  if (schema !== undefined) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return "schema must be an object";
    }
    if (JSON.stringify(schema).length > SCHEMA_MAX_LENGTH) {
      return "schema is too large";
    }
  }

  if (aiStyle !== undefined) {
    if (typeof aiStyle !== "string") {
      return "aiStyle must be a string";
    }
    if (!(aiStyle in STYLE_PROMPTS)) {
      return "Unsupported aiStyle";
    }
  }

  return null;
}

function checkRateLimitInMemory(req) {
  const ip = getClientIp(req);

  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(ip, {
      count: 1,
      resetAt: now + REQUEST_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= REQUEST_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { allowed: false, retryAfter };
  }

  bucket.count += 1;

  if (rateLimitBuckets.size > 10000) {
    for (const [key, value] of rateLimitBuckets.entries()) {
      if (now >= value.resetAt) {
        rateLimitBuckets.delete(key);
      }
    }
  }

  return { allowed: true, retryAfter: 0 };
}

async function checkRateLimitPersistent(req) {
  const redis = getRedisConfig();
  if (!redis) return null;

  const ip = getClientIp(req);
  const now = Date.now();
  const minuteBucket = Math.floor(now / REQUEST_LIMIT_WINDOW_MS);
  const key = `rl:gemini:${ip}:${minuteBucket}`;
  const count = Number(
    await redisCall(redis.baseUrl, redis.token, "INCR", key),
  );

  if (count === 1) {
    await redisCall(
      redis.baseUrl,
      redis.token,
      "EXPIRE",
      key,
      Math.ceil(REQUEST_LIMIT_WINDOW_MS / 1000) + 1,
    );
  }

  const retryAfter = Math.max(
    1,
    Math.ceil((REQUEST_LIMIT_WINDOW_MS - (now % REQUEST_LIMIT_WINDOW_MS)) / 1000),
  );

  if (count > REQUEST_HARD_BLOCK_MAX) {
    await sendSecurityAlert({
      type: "hard-rate-limit-block",
      ip,
      path: req.url || "/api/gemini",
      count,
      ts: new Date().toISOString(),
    });

    return { allowed: false, retryAfter, reason: "hard-limit" };
  }

  if (count > REQUEST_LIMIT_MAX) {
    return { allowed: false, retryAfter, reason: "rate-limit" };
  }

  return { allowed: true, retryAfter: 0, reason: "ok" };
}

async function checkRateLimit(req) {
  // Keep production limits strict, but avoid blocking local feature testing.
  // Set DISABLE_RATE_LIMIT_LOCAL=true in .env.local to bypass rate limiting during development.
  if (process.env.DISABLE_RATE_LIMIT_LOCAL === "true" && isLocalDevelopmentRequest(req)) {
    return { allowed: true, retryAfter: 0, reason: "dev-local-bypass" };
  }

  try {
    const persistent = await checkRateLimitPersistent(req);
    if (persistent) {
      return persistent;
    }
  } catch {
    // Fallback to in-memory limiter if persistent backend is unavailable.
  }

  const fallback = checkRateLimitInMemory(req);
  return {
    ...fallback,
    reason: fallback.allowed ? "in-memory-ok" : "in-memory-rate-limit",
  };
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isContentTypeJson(req)) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }

  if (isBlockedUserAgent(req)) {
    const ip = getClientIp(req);
    await sendSecurityAlert({
      type: "blocked-bot-user-agent",
      ip,
      path: req.url || "/api/gemini",
      userAgent: String(req.headers["user-agent"] || ""),
      ts: new Date().toISOString(),
    });
    return res.status(403).json({ error: "Forbidden" });
  }

  const limit = await checkRateLimit(req);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.setHeader("X-RateLimit-Reason", String(limit.reason || "rate-limit"));
    return res.status(429).json({ error: "Too many requests" });
  }

  const bodyError = validateRequestBody(req.body);
  if (bodyError) {
    return res.status(400).json({ error: bodyError });
  }

  const { prompt: userPrompt, schema, aiStyle = "default" } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing API Key" });
  }

  const systemStyle = STYLE_PROMPTS[aiStyle] || STYLE_PROMPTS.default;
  const finalPrompt = `${systemStyle}\n\nè«?ä¾???§æ­¤é¢¨æ?¼è?????ä»¥ä??è¦?æ±?ï¼?\n${userPrompt || ""}`;

  const models = ["gemini-2.5-flash"];

  try {
    let lastStatus = 500;
    let lastData = { error: "Internal Server Error" };

    for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const googleRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalPrompt }] }],
          generationConfig: schema
            ? {
                responseMimeType: "application/json",
                responseSchema: schema,
              }
            : {},
        }),
      });

      const data = await googleRes.json().catch(() => ({}));
      if (googleRes.ok) return res.status(200).json(data);

      lastStatus = googleRes.status;
      lastData = data;

      const canFallback = googleRes.status === 503 && i < models.length - 1;
      if (!canFallback) {
        return res.status(googleRes.status).json(data);
      }
    }

    return res.status(lastStatus).json(lastData);
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
