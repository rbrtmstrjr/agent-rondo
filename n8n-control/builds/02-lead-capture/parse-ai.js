// ============================================================================
// Parse AI — Code node (no credentials). Parses the enrich+score JSON and builds
// the Sheet row, the homeowner email, and the Slack alert. Falls back gracefully
// if the AI response is unusable so a lead is never silently lost.
// ============================================================================

const cfg = $('Config').first().json;
const v = $('Validate & Prepare').first().json;
const lead = v.lead;
const chat = $json; // generateContent response

let ai = {};
try {
  const text = chat.candidates[0].content.parts.map((p) => p.text || '').join('');
  ai = JSON.parse(text);
} catch (e) {
  ai = {};
}

// Defensive defaults — if AI failed, treat as a warm lead needing human review.
const summary = ai.summary || (lead.message ? lead.message.slice(0, 140) : 'New lead');
const serviceType = ai.serviceType || lead.service || 'Other';
const urgency = ai.urgency || 'Soon';
const inArea = typeof ai.inServiceArea === 'boolean' ? ai.inServiceArea : true;
const valueBand = ai.valueBand || 'Medium';
const score = Number.isFinite(ai.leadScore) ? ai.leadScore : 50;
const temperature = ai.temperature || (score >= (cfg.hotThreshold || 70) ? 'Hot' : score >= 40 ? 'Warm' : 'Cold');
const reason = ai.reason || 'Auto-scored (AI unavailable) — please review.';
const suggestedReply = ai.suggestedReply || 'Call the customer to confirm details and book.';
const emailSubject = ai.emailSubject || ('Thanks for contacting ' + cfg.companyName + '!');
const emailBody = ai.emailBody
  || ('Hi ' + (lead.name || 'there') + ',\n\nThanks for reaching out to ' + cfg.companyName
      + '. We received your request and a specialist will follow up shortly. For anything urgent, please call us at '
      + cfg.phone + '.\n\n— The ' + cfg.companyName + ' Team');

const now = new Date();
const timestamp = now.toISOString();

// Google Sheets row (must match the header order in Set Headers).
const row = [
  timestamp,
  lead.name,
  lead.email,
  lead.phone,
  lead.zip,
  lead.service,
  lead.urgency,
  lead.message,
  summary,
  serviceType,
  urgency,
  inArea ? 'Yes' : 'No',
  valueBand,
  score,
  temperature,
  reason,
  'New',
];

const tempIcon = temperature === 'Hot' ? '🔥' : temperature === 'Warm' ? '🌤️' : '❄️';
const contact = [lead.email, lead.phone].filter(Boolean).join(' · ') || '(no contact given)';
const slackText = tempIcon + ' *' + temperature.toUpperCase() + ' lead* · score ' + score + '/100 · ' + serviceType + ' · ' + urgency
  + (inArea ? '' : ' · ⚠️ OUT OF AREA')
  + '\n*' + (lead.name || 'Unknown') + '* — ' + contact
  + (lead.zip ? ' · ' + lead.zip : '')
  + '\n> ' + (lead.message || '(no message)')
  + '\n*Why:* ' + reason
  + '\n*Next step:* ' + suggestedReply;

return [{ json: {
  row,
  email: { to: lead.email, subject: emailSubject, body: emailBody },
  slackText,
  summary, serviceType, urgency, inArea, valueBand, score, temperature,
  name: lead.name,
} }];
