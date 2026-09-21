// api/generate-hints.js
// Returns simple A1-level hints for a list of Hangman words.
// Request:  POST { words: ["banana", "umbrella"] }
// Response: { hints: { banana: "It is a long yellow fruit.", umbrella: "..." } }
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[generate-hints] GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  const { words } = req.body || {};

  const safeWords = Array.isArray(words)
    ? [...new Set(words.map(w => String(w).toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean))].slice(0, 12)
    : [];

  if (safeWords.length < 1) {
    return res.status(400).json({ error: 'A list of words is required.' });
  }

  const prompt =
    `You write hints for a Hangman game for CEFR A1 English learners (complete beginners). ` +
    `For each word below, write ONE hint: a very short, simple sentence of 4 to 8 words. ` +
    `Use only very common, easy words and the simple present tense. ` +
    `Never use the target word itself, or any word that contains it. ` +
    `Return only a JSON object where each key is the word exactly as given and each value is its hint. ` +
    `No markdown or explanations. Words: ${JSON.stringify(safeWords)}`;

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
      console.error('[generate-hints] Gemini error:', apiRes.status, details);
      return res.status(502).json({ error: 'Gemini API call failed.', details });
    }

    const data = await apiRes.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();

    if (!text) return res.status(502).json({ error: 'Gemini returned no hints.' });

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      console.error('[generate-hints] Invalid Gemini JSON:', text);
      return res.status(502).json({ error: 'Gemini returned invalid JSON.' });
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return res.status(502).json({ error: 'Gemini returned hints in the wrong format.' });
    }

    // Keep only hints for the requested words, and drop any that give the word away.
    const lowerKeyed = {};
    Object.keys(parsed).forEach(k => {
      lowerKeyed[String(k).toLowerCase().replace(/[^a-z]/g, '')] = parsed[k];
    });

    const hints = {};
    safeWords.forEach(word => {
      const hint = String(lowerKeyed[word] || '').trim().slice(0, 100);
      if (hint && !hint.toLowerCase().includes(word)) hints[word] = hint;
    });

    if (Object.keys(hints).length < 1) {
      return res.status(502).json({ error: 'Gemini returned no usable hints.' });
    }

    return res.status(200).json({ hints });
  } catch (err) {
    console.error('[generate-hints] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
