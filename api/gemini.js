// api/gemini.js

const STYLE_PROMPTS = {
  default: "你是一位親切且專業的學習助手「Memo助手」，語氣溫暖，重點分布平均。",
  academic:
    "你是一位嚴謹的教授，請使用大量專業術語，結構極度嚴密，並加強邏輯推演與學術深度。",
  minimalist:
    "你是一位極簡主義筆記專家，請刪除所有冗詞贅句，只保留核心概念與行動清單，文字極度精煉。",
  storyteller:
    "你是一位擅長簡化概念的導師，請使用淺顯易懂的語言，多用比喻來解釋複雜概念，讓筆記像故事一樣好讀。",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 接收原本的 prompt 與新增的 aiStyle
  const { prompt: userPrompt, schema, aiStyle = "default" } = req.body;
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing API Key" });
  }

  // 根據選擇的風格，組合最終的指令
  const systemStyle = STYLE_PROMPTS[aiStyle] || STYLE_PROMPTS.default;
  const finalPrompt = `${systemStyle}\n\n請依照此風格處理以下要求：\n${userPrompt}`;

  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const googleRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    const data = await googleRes.json();
    if (!googleRes.ok) return res.status(googleRes.status).json(data);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
}
