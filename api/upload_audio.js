import { PDFParse } from "pdf-parse";
export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    try {
      const { fileName, mimeType, fileBase64, materialFile } = req.body || {};

        if (!fileName || !mimeType || !fileBase64) {
            return res.status(400).json({
            error: "Missing required fields: fileName, mimeType, fileBase64",
            });
        }

        const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
        const geminiApiKey =
            process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

        if (!deepgramApiKey) {
            return res.status(500).json({
            error: "Missing DEEPGRAM_API_KEY in environment variables",
            });
        }

        if (!geminiApiKey) {
            return res.status(500).json({
            error: "Missing GEMINI_API_KEY in environment variables",
            });
        }

        console.log("音檔檔名:", fileName);
        console.log("是否收到教材 PDF:", !!materialFile);

        if (materialFile) {
            console.log("教材檔名:", materialFile.fileName);
            console.log("教材 MIME:", materialFile.mimeType);
        }

        let materialText = "";

        if (materialFile?.fileBase64) {
        try {
            const pdfBuffer = Buffer.from(materialFile.fileBase64, "base64");

            const parser = new PDFParse({ data: pdfBuffer });
            const textResult = await parser.getText();
            await parser.destroy();

            materialText = (textResult?.text || "").trim();

            console.log("PDF 抽字成功，前 300 字：");
            console.log(materialText.slice(0, 300) || "[PDF 沒有抽到文字]");
        } catch (pdfError) {
            console.error("PDF 文字抽取失敗:", pdfError);
        }
        }

        // 1) base64 -> binary
        const audioBuffer = Buffer.from(fileBase64, "base64");
  
      // 2) Deepgram 轉逐字稿
      const deepgramResponse = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=zh-TW",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramApiKey}`,
            "Content-Type": mimeType || "audio/mpeg",
          },
          body: audioBuffer,
        }
      );
  
      const deepgramResult = await deepgramResponse.json();
  
      if (!deepgramResponse.ok) {
        return res.status(500).json({
          error: "Deepgram transcription failed",
          details: deepgramResult,
        });
      }
  
      const transcript =
        deepgramResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    
    
  
      if (!transcript.trim()) {
        return res.status(500).json({
          error: "Deepgram returned empty transcript",
          details: deepgramResult,
        });
      }
  
      // 3) 把 transcript 丟給 Gemini，沿用你們原本「逐字稿 -> 結構化筆記」邏輯
      const prompt = `
        你是一位專業筆記助手「Memo助手」。
        請根據以下資料，整理出一份高品質、結構清楚的繁體中文課堂筆記，並嚴格輸出為 JSON。

        你會收到兩種來源：
        1. 課堂逐字稿（主要依據）
        2. 教材文字（輔助依據）

        請遵守以下規則：
        1. 以「課堂逐字稿」作為主要內容來源。
        2. 「教材文字」只能用來補充章節名稱、專有名詞、定義、條列結構。
        3. 如果逐字稿與教材文字有不一致，優先保留逐字稿中的課堂實際講述內容。
        4. 不要捏造逐字稿與教材都沒有提到的資訊。
        5. 請整理成適合學生課後複習的重點式筆記。
        6. segments 內容請優先根據逐字稿整理。
        7. sections 要比單純逐字稿更有結構。

        【課堂逐字稿】
        ${transcript || ""}

        【教材文字】
        ${materialText || "無教材內容"}

        請輸出 JSON，格式如下：
        {
        "title": "筆記標題",
        "intro": "這份筆記的摘要",
        "sections": [
            {
            "category": "主題名稱",
            "items": ["重點1", "重點2", "重點3"]
            }
        ],
        "segments": [
            {
            "time": "00:00",
            "text": "逐字稿重點整理"
            }
        ]
        }
        `;
  
      const geminiSchema = {
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
                items: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["category", "items"],
            },
          },
          segments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                time: { type: "STRING" },
                text: { type: "STRING" },
              },
              required: ["time", "text"],
            },
          },
        },
        required: ["title", "intro", "sections", "segments"],
      };
  
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: geminiSchema,
            },
          }),
        }
      );
  
      const geminiResult = await geminiResponse.json();
  
      console.log("Gemini 原始回應:", JSON.stringify(geminiResult, null, 2));

        if (!geminiResponse.ok) {
        console.error("Gemini note generation failed:", JSON.stringify(geminiResult, null, 2));

        return res.status(500).json({
            error: "Gemini note generation failed",
            details: geminiResult,
        });
        }
  
      const rawText =
        geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  
      let note;
      try {
        note = JSON.parse(rawText);
      } catch (e) {
        return res.status(500).json({
          error: "Failed to parse Gemini JSON response",
          rawText,
        });
      }
  
      return res.status(200).json({
        transcript,
        duration: "00:00",
        note,
      });
    } catch (error) {
      console.error("upload-audio API error:", error);
      return res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  }