// Glue: pull the image bytes out of the Gemini response and verify them.
const res = $json;
let b64 = ''; let mime = '';
try {
  const parts = res.candidates[0].content.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  const d = img ? (img.inlineData || img.inline_data) : null;
  if (d) { b64 = d.data || ''; mime = (d.mimeType || d.mime_type || '').toLowerCase(); }
} catch (e) { /* falls through to the empty-payload rejection */ }

// The requested aspect ratio is handed to validateImage so it can compare it
// against the ratio actually observed in the returned bytes (spec §16 item 1).
// A mismatch is recorded, never enforced: r.valid ignores it entirely, and
// Log Attempt writes the observation into the Attempts tab's `aspect` column.
const aspectRequested = $('Build Image Prompt').first().json.aspectRequested;
const r = validateImage({ b64, mime }, { minBytes: 20480, aspectRequested });
const out = { valid: r.valid, reasons: r.reasons, bytes: r.bytes,
  width: r.width, height: r.height, aspect: r.aspect,
  aspectRequested: r.aspectRequested, aspectMatches: r.aspectMatches };

if (!r.valid) return [{ json: out }];
return [{ json: out, binary: { data: await this.helpers.prepareBinaryData(Buffer.from(b64, 'base64'), 'creative.png', mime || 'image/png') } }];
