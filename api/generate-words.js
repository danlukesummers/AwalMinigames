// api/generate-words.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('[generate-words] GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }
  const { topic, level, count } = req.body || {};
  const safeCount = Math.max(3, Math.min(12, parseInt(count, 10) || 6));
  const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const safeLevel = allowedLevels.includes(level) ? level : 'B1';
  const safeTopic = String(topic || '').trim().slice(0, 80);
  if (!safeTopic) return res.status(400).json({ error: 'Topic is required.' });
  const prompt = `Generate exactly ${safeCount} single English vocabulary words suitable for CEFR ${safeLevel} ESL students about "${safeTopic}". Return only a JSON array of lowercase English words. Use single words only, not phrases. No punctuation, explanations, markdown or duplicates.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    if (!apiRes.ok) {
      const details = await apiRes.text();
      console.error('[generate-words] Gemini error:', apiRes.status, details);
      return res.status(502).json({ error: 'Gemini API call failed.', details });
    }
    const data = await apiRes.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'Gemini returned no vocabulary.' });
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[generate-words] Invalid Gemini JSON:', text);
      return res.status(502).json({ error: 'Gemini returned invalid JSON.' });
    }
    const words = Array.isArray(parsed)
      ? [...new Set(parsed.map(w => String(w).toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean))].slice(0, safeCount)
      : [];
    if (words.length < 1) return res.status(502).json({ error: 'Gemini returned no valid vocabulary.' });
    return res.status(200).json({ words });
  } catch (err) {
    console.error('[generate-words] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
