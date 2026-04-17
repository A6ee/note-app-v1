const STYLE_PROMPTS = {
  default: "你是一位親切且專業的學習助手「Memo助手」，語氣溫暖，重點分布平均。",
  academic:
    "你是一位嚴謹的教授，請使用大量專業術語，結構極度嚴密，並加強邏輯推演與學術深度。",
  minimalist:
    "你是一位極簡主義筆記專家，請刪除所有冗詞贅句，只保留核心概念與行動清單，文字極度精煉。",
  storyteller:
    "你是一位擅長簡化概念的導師，請使用淺顯易懂的語言，多用比喻來解釋複雜概念，讓筆記像故事一樣好讀。",
};

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]);

const MAX_AUDIO_BYTES = 2.5 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 16;

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function estimateBase64Bytes(base64) {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function cleanTextJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

const S2T_PHRASE_MAP = {
  "讲座": "講座",
  "内容": "內容",
  "回顾": "回顧",
  "计算机": "計算機",
  "机密": "機密",
  "环境": "環境",
  "运行": "運行",
  "结构": "結構",
  "总结": "總結",
  "笔记": "筆記",
  "课程": "課程",
  "录音": "錄音",
  "语音": "語音",
  "学习": "學習",
  "资料": "資料",
  "系统": "系統",
  "专业": "專業",
};

const S2T_CHAR_MAP = {
  讲: "講", 学: "學", 习: "習", 录: "錄", 课: "課", 笔: "筆", 记: "記",
  资: "資", 内: "內", 顾: "顧", 计: "計", 机: "機", 与: "與", 进: "進",
  术: "術", 极: "極", 运: "運", 环: "環", 绝: "絕", 对: "對", 发: "發",
  展: "展", 实: "實", 验: "驗", 关: "關", 键: "鍵", 问: "問", 题: "題",
  点: "點", 类: "類", 别: "別", 织: "織", 专: "專", 业: "業", 语: "語",
  说: "說", 这: "這", 为: "為", 们: "們", 该: "該", 后: "後", 图: "圖",
  标: "標", 准: "準", 断: "斷", 续: "續", 复: "復", 杂: "雜", 纲: "綱",
  导: "導", 简: "簡", 转: "轉", 换: "換", 优: "優", 势: "勢", 统: "統",
  结: "結", 构: "構", 况: "況", 态: "態", 网: "網", 络: "絡", 讯: "訊",
  达: "達", 释: "釋", 读: "讀", 写: "寫", 边: "邊",
};

function toTraditionalChinese(input) {
  let text = String(input || "");
  if (!text) return "";

  Object.entries(S2T_PHRASE_MAP).forEach(([s, t]) => {
    text = text.split(s).join(t);
  });

  return Array.from(text)
    .map((ch) => S2T_CHAR_MAP[ch] || ch)
    .join("");
}

function normalizePayload(payload) {
  const title = toTraditionalChinese(String(payload?.title || "").trim()) || "新筆記";
  const intro = toTraditionalChinese(String(payload?.intro || "").trim()) || "尚無摘要";

  const sections = Array.isArray(payload?.sections)
    ? payload.sections
        .map((section) => ({
          category:
            toTraditionalChinese(String(section?.category || "未分類重點").trim())
            || "未分類重點",
          items: Array.isArray(section?.items)
            ? section.items
                .map((item) => toTraditionalChinese(String(item || "").trim()))
                .filter(Boolean)
            : [],
        }))
        .filter((section) => section.items.length > 0)
    : [];

  const segments = Array.isArray(payload?.segments)
    ? payload.segments
        .map((segment) => ({
          time: String(segment?.time || "").trim(),
          text: toTraditionalChinese(String(segment?.text || "").trim()),
        }))
        .filter((segment) => segment.text)
    : [];

  return {
    title,
    intro,
    sections,
    segments,
    transcript: toTraditionalChinese(String(payload?.transcript || "").trim()),
  };
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Invalid request body";
  }

  const { audioBase64, mimeType, aiStyle } = body;

  if (typeof audioBase64 !== "string" || audioBase64.trim().length === 0) {
    return "audioBase64 is required";
  }
  if (audioBase64.length > MAX_BASE64_LENGTH) {
    return "audioBase64 is too large";
  }

  if (typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return "Unsupported mimeType";
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

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }

  const bodyError = validateBody(req.body);
  if (bodyError) {
    return res.status(400).json({ error: bodyError });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing API Key" });
  }

  const { audioBase64, mimeType, aiStyle = "default" } = req.body;
  const audioBytes = estimateBase64Bytes(audioBase64);
  if (!Number.isFinite(audioBytes) || audioBytes <= 0) {
    return res.status(400).json({ error: "Invalid audio payload" });
  }
  if (audioBytes > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: "Audio file too large" });
  }

  const systemStyle = STYLE_PROMPTS[aiStyle] || STYLE_PROMPTS.default;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      intro: { type: "STRING" },
      sections: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING" },
            items: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["category", "items"],
        },
      },
      transcript: { type: "STRING" },
      segments: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            time: { type: "STRING" },
            text: { type: "STRING" },
          },
        },
      },
    },
    required: ["title", "intro", "sections"],
  };

  const prompt = [
    systemStyle,
    "你會收到一段課堂或會議錄音，請輸出高品質繁體中文筆記。",
    "即使原始音訊內容是英文或其他語言，title、intro、sections.category、sections.items、transcript 都必須以繁體中文輸出。",
    "請只輸出 JSON，不要輸出 markdown code block。",
    "sections 至少 2 組，每組至少 2 點，重點要具體可複習。",
    "若可行，補上簡短 transcript 與 segments；若不可行可留空字串/空陣列。",
  ].join("\n\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const googleRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    const data = await googleRes.json().catch(() => ({}));
    if (!googleRes.ok) {
      if (googleRes.status === 503) {
        res.setHeader("Retry-After", "60");
      }
      return res.status(googleRes.status).json(data);
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = cleanTextJson(rawText);
    if (!clean) {
      return res.status(502).json({ error: "Gemini audio response is empty" });
    }

    const parsed = JSON.parse(clean);
    const normalized = normalizePayload(parsed);

    if (!Array.isArray(normalized.sections) || normalized.sections.length === 0) {
      return res.status(422).json({ error: "Gemini audio response has empty sections" });
    }

    return res.status(200).json(normalized);
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
