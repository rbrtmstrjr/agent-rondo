// ============================================================================
// Parse Triage — Code node (runOnceForEachItem, no credentials). Parses the
// triage JSON for THIS email and builds the Slack review card. needsReply gates
// whether it gets posted.
// ============================================================================

const cfg = $('Config').first().json;
const p = $('Prepare Triage').item.json;
const chat = $json; // generateContent response for this item

let ai = {};
try { ai = JSON.parse(chat.candidates[0].content.parts.map((x) => x.text || '').join('')); } catch (e) { ai = {}; }

const category = ai.category || 'Other';
const sentiment = ai.sentiment || 'Neutral';
const summary = ai.summary || '';
const draft = ai.draftBody || '';
const needsReply = !p.dup && !p.empty && ai.needsReply === true && draft.trim() !== '';

const slackText = '📨 *New email* · ' + category + ' · ' + sentiment
  + '\n*From:* ' + p.from
  + '\n*Subject:* ' + p.subject
  + '\n*Summary:* ' + summary
  + (needsReply
      ? '\n\n*Suggested reply* _(review, tweak, then send from Gmail)_:\n>>> ' + draft
      : '\n_No reply needed._');

return { json: { needsReply, category, sentiment, slackText, from: p.from, subject: p.subject } };
