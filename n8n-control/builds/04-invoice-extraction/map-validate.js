// ============================================================================
// Map & Validate — Code node (no creds). Parses the extracted invoice, runs the
// MATH/confidence trust gate, builds the Airtable record, a dedup lookup formula,
// and a human-readable status message (used for the WhatsApp reply / response).
// ============================================================================

const cfg = $('Config').first().json;
const v = $('Validate Input').first().json;
const chat = $json; // generateContent response

let ai = {};
try { ai = JSON.parse(chat.candidates[0].content.parts.map((p) => p.text || '').join('')); } catch (e) { ai = {}; }

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const vendor = (ai.vendor || '').toString().trim();
const invNo = (ai.invoiceNumber || '').toString().trim();
const subtotal = num(ai.subtotal), tax = num(ai.tax), total = num(ai.total);
const items = Array.isArray(ai.lineItems) ? ai.lineItems : [];
const conf = Math.max(0, Math.min(100, num(ai.confidence)));
const currency = (ai.currency || 'USD').toString().trim();
const invoiceDate = (ai.invoiceDate || '').toString().trim();

// ---- Trust gate: money data must add up, or a human reviews it ----
const tol = Number(cfg.mathTolerance || 0.02);
const itemsSum = items.reduce((s, it) => s + num(it.amount), 0);
const reasons = [];
if (!total) reasons.push('missing total');
if (!vendor) reasons.push('missing vendor');
const base = subtotal || total;
if (items.length && base && Math.abs(itemsSum - base) > Math.max(0.05, base * tol)) reasons.push('line items don\'t sum to subtotal');
if (subtotal && total && Math.abs((subtotal + tax) - total) > Math.max(0.05, total * tol)) reasons.push('subtotal + tax ≠ total');
if (conf && conf < Number(cfg.confidenceThreshold || 70)) reasons.push('low AI confidence (' + conf + '%)');

const status = reasons.length ? 'Needs Review' : 'OK';

const lineItemsText = items.map((it) =>
  '• ' + (it.description || 'item') + (num(it.qty) ? ' ×' + num(it.qty) : '') + (num(it.unitPrice) ? ' @ ' + num(it.unitPrice) : '') + ' = ' + num(it.amount).toFixed(2)
).join('\n');

const fields = {
  'Invoice Number': invNo,
  'Vendor': vendor,
  'Invoice Date': invoiceDate,
  'Due Date': ai.dueDate || '',
  'Subtotal': subtotal,
  'Tax': tax,
  'Total': total,
  'Currency': currency,
  'Category': ai.category || '',
  'Line Items': lineItemsText,
  'Status': status,
  'Confidence': conf / 100,
  'Review Notes': ([reasons.join('; '), ai.notes || ''].filter(Boolean).join(' | ')).slice(0, 1000),
  'Source File': v.filename,
  'Logged At': new Date().toISOString(),
};
if (!fields['Invoice Date']) delete fields['Invoice Date'];
if (!fields['Due Date']) delete fields['Due Date'];

// ---- Dedup key: an invoice # is the natural unique key; else vendor+total(+date) ----
const esc = (s) => String(s).replace(/["\\]/g, ' ').trim(); // formula-safe
let dedupFormula;
if (invNo) {
  dedupFormula = 'AND({Vendor}="' + esc(vendor) + '",{Invoice Number}="' + esc(invNo) + '")';
} else {
  dedupFormula = 'AND({Vendor}="' + esc(vendor) + '",{Total}=' + total + (invoiceDate ? ',{Invoice Date}="' + esc(invoiceDate) + '"' : '') + ')';
}

const money = currency + ' ' + total.toFixed(2);
const message = status === 'OK'
  ? '✅ Logged: ' + (vendor || 'invoice') + ' — ' + money + (invNo ? ' (#' + invNo + ')' : '')
  : '⚠️ Needs review: ' + (vendor || 'invoice') + ' — ' + money + '\nWhy: ' + reasons.join('; ');

return [{ json: {
  status, vendor, invoiceNumber: invNo, total, currency, dueDate: ai.dueDate || '', itemCount: items.length, confidence: conf, reasons,
  airtableBody: { fields, typecast: true },
  dedupFormula,
  message,
} }];
