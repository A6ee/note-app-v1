// api/gemini.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, schema } = req.body;

    // Unified env source: project config is stored in .env.
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY; 
    
    // error return for missing API key, to avoid silent failures and help with debugging.
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    const model = "gemini-2.5-flash"; // model name can be made dynamic in the future if needed, but hardcoding for simplicity now.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
        const googleRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(20000),
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: schema ? { 
                    responseMimeType: "application/json", 
                    responseSchema: schema 
                } : {}
            })
        });

        const data = await googleRes.json();

        if (!googleRes.ok) {
            console.error("Gemini API Error:", data);
            return res.status(googleRes.status).json(data);
        }

        res.status(200).json(data);
    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}