// ============================================================================
// Prepare Triage — Code node (runOnceForAllItems, no credentials). For each new
// email from the IMAP trigger, extracts from/subject/body, dedups by messageId,
// and builds a Gemini triage+draft request (structured JSON output).
// ============================================================================

const cfg = $('Config').first().json;
const emails = $('Email Trigger (IMAP)').all();

let sd = {};
try { sd = $getWorkflowStaticData('global'); } catch (e) { sd = {}; }
sd.seen = sd.seen || {};
const now = Date.now();
for (const k of Object.keys(sd.seen)) { if (now - sd.seen[k] > 7 * 86400000) delete sd.seen[k]; }

const extractFrom = (e) => {
  const f = e.from;
  if (!f) return String(e.fromText || '');
  if (typeof f === 'string') return f;
  if (f.text) return f.text;
  if (f.value && f.value[0]) { const v = f.value[0]; return (v.name ? v.name + ' ' : '') + '<' + (v.address || '') + '>'; }
  return '';
};
const extractBody = (e) => {
  let b = e.text || e.textPlain || e.body || '';
  if (!b && (e.textHtml || e.html)) b = String(e.textHtml || e.html).replace(/<[^>]+>/g, ' ');
  return String(b).replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ').trim().slice(0, 4000);
};

const maxAgeMs = Number(cfg.maxAgeHours || 72) * 3600000;

const out = [];
for (const it of emails) {
  const e = it.json;
  // Skip old backlog (e.g. on activation) so we never flood on unread promo mail.
  const ts = Date.parse(e.date || e.receivedDate || '') || now;
  if (now - ts > maxAgeMs) continue;

  const from = extractFrom(e);
  const subject = String(e.subject || '(no subject)');
  const body = extractBody(e);
  const messageId = String(e.messageId || e.uid || (from + '|' + subject)).slice(0, 250);
  const dup = !!sd.seen[messageId];
  if (!dup) sd.seen[messageId] = now;

  const sys = 'You are the email assistant for ' + cfg.companyName + ', a home-services company (HVAC, plumbing, electrical) serving the Greater Portland area. '
    + 'Triage this incoming email and return JSON. '
    + 'category is one of: "Lead reply", "New inquiry", "Booking/scheduling", "Question", "Not interested", "Spam/Promo", "Other". '
    + 'needsReply = true ONLY if a real person (a customer, lead, or genuine inquiry) would expect a reply from the business; '
    + 'false for newsletters, promotions, no-reply/automated messages, receipts, or internal notices. '
    + 'summary: 1-2 sentences on what they want. sentiment: one of Positive/Neutral/Negative/Urgent. '
    + 'If needsReply is true, write draftBody: a warm, professional reply in the voice of a ' + cfg.companyName + ' rep that moves the conversation forward — '
    + 'answer what you can, and invite them to book or call ' + cfg.phone + '. '
    + 'Use these facts and NEVER contradict or invent beyond them: ' + cfg.facts + ' '
    + 'Keep the draft concise (4-7 sentences), plain text, and sign off "The ' + cfg.companyName + ' Team". draftSubject = "Re: " + their subject. '
    + 'If needsReply is false, draftSubject and draftBody must be empty strings. reason: one short line on why you classified it this way.';

  const geminiBody = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: 'user', parts: [{ text: 'FROM: ' + from + '\nSUBJECT: ' + subject + '\n\nBODY:\n' + (body || '(empty)') }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING' },
          needsReply: { type: 'BOOLEAN' },
          summary: { type: 'STRING' },
          sentiment: { type: 'STRING' },
          draftSubject: { type: 'STRING' },
          draftBody: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['category', 'needsReply', 'summary', 'sentiment', 'draftSubject', 'draftBody', 'reason'],
      },
    },
  };

  out.push({ json: { from, subject, messageId, dup, geminiBody } });
}

return out.length ? out : [{ json: { from: '', subject: '', messageId: '', dup: true, geminiBody: null, empty: true } }];
