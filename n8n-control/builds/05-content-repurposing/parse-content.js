// ============================================================================
// Parse Content — Code node (no creds). Parses the generated drafts and builds
// the Airtable record + the image-generation request.
// ============================================================================

const cfg = $('Config').first().json;
const src = $('Get Source & Build Prompt').first().json;
const chat = $json;

let c = {};
try { c = JSON.parse(chat.candidates[0].content.parts.map((p) => p.text || '').join('')); } catch (e) { c = {}; }

const title = (c.title || src.input.slice(0, 60) || 'Untitled content').toString().trim();

const fields = {
  'Title': title,
  'Source Type': src.sourceType,
  'Source': src.sourceText,
  'LinkedIn': c.linkedin || '',
  'X / Twitter': c.twitter || '',
  'Facebook': c.facebook || '',
  'Instagram': c.instagram || '',
  'Hashtags': c.hashtags || '',
  'Image Prompt': c.imagePrompt || '',
  'Status': 'Pending Approval',
  'Created': new Date().toISOString(),
};

const imagePrompt = (c.imagePrompt || ('A clean professional graphic for ' + cfg.companyName))
  + '. Square 1:1 composition, modern, polished, on-brand for a home-services company. No text, no watermark, no logos.';

return [{ json: {
  title,
  summary: c.summary || '',
  airtableBody: { fields, typecast: true },
  imageGeminiBody: { contents: [{ role: 'user', parts: [{ text: imagePrompt }] }] },
} }];
