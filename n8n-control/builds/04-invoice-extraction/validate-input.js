// ============================================================================
// Validate Input — Code node (no creds). Accepts an uploaded PDF/image (base64),
// checks type/size, and builds the Gemini Vision extraction request.
// ============================================================================

const cfg = $('Config').first().json;
const wh = $('Upload Webhook').first().json;
const body = (wh && wh.body) ? wh.body : {};

const filename = String(body.filename || 'document');
let data = String(body.data || '');
let mt = String(body.mimeType || '').toLowerCase();

// Accept a data URL too: data:application/pdf;base64,xxxx
const m = data.match(/^data:([^;]+);base64,(.*)$/s);
if (m) { if (!mt) mt = m[1].toLowerCase(); data = m[2]; }
data = data.trim();

const okType = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif))$/.test(mt);

let valid = true; let reason = '';
if (!data) { valid = false; reason = 'No file data received.'; }
else if (!okType) { valid = false; reason = 'Unsupported file type (' + (mt || 'unknown') + '). Please upload a PDF or image.'; }
else if (data.length > 18 * 1024 * 1024) { valid = false; reason = 'File too large (max ~13 MB).'; }

const prompt = 'You are an accounts-payable assistant for ' + cfg.companyName + '. '
  + 'Extract this invoice/receipt into JSON. Read EVERY line item. '
  + 'Amounts must be plain numbers (no currency symbols or commas). Dates as YYYY-MM-DD. '
  + 'currency = ISO code (e.g. USD). category = a short expense category (e.g. HVAC parts, Plumbing supplies, Electrical, Tools, Services). '
  + 'If a field is missing or unreadable, use "" for text and 0 for numbers. '
  + 'confidence = your overall 0-100 confidence in the extraction. notes = anything ambiguous or unreadable.';

const geminiBody = {
  contents: [{ role: 'user', parts: [
    { inlineData: { mimeType: mt, data } },
    { text: prompt },
  ] }],
  generationConfig: {
    temperature: 0.1,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        vendor: { type: 'STRING' },
        invoiceNumber: { type: 'STRING' },
        invoiceDate: { type: 'STRING' },
        dueDate: { type: 'STRING' },
        currency: { type: 'STRING' },
        subtotal: { type: 'NUMBER' },
        tax: { type: 'NUMBER' },
        total: { type: 'NUMBER' },
        category: { type: 'STRING' },
        lineItems: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              description: { type: 'STRING' },
              qty: { type: 'NUMBER' },
              unitPrice: { type: 'NUMBER' },
              amount: { type: 'NUMBER' },
            },
            required: ['description', 'amount'],
          },
        },
        confidence: { type: 'NUMBER' },
        notes: { type: 'STRING' },
      },
      required: ['vendor', 'total', 'lineItems', 'confidence'],
    },
  },
};

return [{ json: { valid, reason, filename, mimeType: mt, geminiBody } }];
