// api/generate-words.js
//
// Vercel serverless function. Calls Google's Gemini API, which has a genuine
// no-credit-card free tier. Get a free key at
// https://aistudio.google.com/api-keys and set it in Vercel as an
// Environment Variable named GEMINI_API_KEY.
//
// IMPORTANT: this key must stay server-side, never in hangman.js/hangman.html.

const GEMINI_MODEL = 'gemini-2.5-flash'; // free-tier model as of Sept 2026

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[generate-words] GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'Server is not configured for AI generation.' });
  }

  const { topic, level, count } = req.body || {};

  const safeCount = Math.max(3, Math.min(12, parseInt(count, 10) || 6));
  const allowedLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const safeLevel = allowedLevels.includes(level) ? level : 'B1';
  const safeTopic = String(topic || '').trim().slice(0, 80);

  if (!safeTopic) {
    return res.status(400).json({ error: 'Topic is required.' });
  }

  const prompt =
    'Generate exactly ' + safeCount + ' single English vocabulary words appropriate for CEFR level ' +
    safeLevel + ' ESL students, on the topic of "' + safeTopic + '". Words only, no phrases, no ' +
    'punctuation. Respond ONLY with a JSON array of lowercase strings, nothing else, no markdown fences.';

  try {
    const apiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' +
        process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
        }),
      }
    );

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('[generate-words] Gemini API error:', apiRes.status, errText);
      return res.status(502).json({ error: 'AI generation failed.' });
    }

    const data = await apiRes.json();
    const text = ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[generate-words] Could not parse model output as JSON:', clean);
      return res.status(502).json({ error: 'AI returned an unexpected format.' });
    }

    const words = Array.isArray(parsed)
      ? parsed
          .map((w) => String(w).toLowerCase().replace(/[^a-z]/g, ''))
          .filter(Boolean)
          .slice(0, safeCount)
      : [];

    return res.status(200).json({ words });
  } catch (err) {
    console.error('[generate-words] Unexpected error:', err);
    return res.status(502).json({ error: 'AI generation failed.' });
  }
}
