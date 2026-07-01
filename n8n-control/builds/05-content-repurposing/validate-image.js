// ============================================================================
// Validate Image — Code node (no creds). Pulls the base64 image out of the Gemini
// image response and prepares the Airtable attachment upload. Gemini occasionally
// returns a 0-byte image (success, not error) — we drop those gracefully.
// ============================================================================

const chat = $json; // image generateContent response
const pc = $('Parse Content').first().json;

let data = '';
let mime = 'image/png';
try {
  const parts = chat.candidates[0].content.parts || [];
  for (const p of parts) {
    if (p.inlineData && p.inlineData.data) { data = p.inlineData.data; mime = p.inlineData.mimeType || 'image/png'; break; }
  }
} catch (e) { data = ''; }

const imageOk = !!data && data.length > 1000;
const filename = (pc.title || 'post').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() + '.png';

return [{ json: {
  imageOk,
  mime,
  uploadBody: imageOk ? { contentType: mime, file: data, filename } : { contentType: 'image/png', file: '', filename: 'none.png' },
} }];
