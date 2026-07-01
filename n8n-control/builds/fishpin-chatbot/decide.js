// ============================================================================
// Decide — Code node (no credentials). Parses Gemini's answer; escalates to a
// human when the model said ESCALATE, returned nothing, or retrieval was weak.
// ============================================================================

const cfg = $('Config').first().json;
const ret = $('Retrieve').first().json;
const chat = $json;

let answer = '';
try {
  answer = chat.candidates[0].content.parts.map((p) => p.text || '').join('').trim();
} catch (e) {
  answer = '';
}

// Escalation is INTENT-based. The model writes a warm, contextual reply and appends
// a [[HANDOFF]] marker line when a human should follow up — we strip the marker but
// KEEP the helpful reply, so the customer is answered first, never cold-deflected.
// Bare "ESCALATE" (legacy) or an empty answer falls back to a friendly default.
const HANDOFF_RE = /\[\[\s*hand\s*-?\s*off\s*\]\]/gi;
const norm = answer.toUpperCase().replace(/[^A-Z]/g, '');
let escalate = false;

if (HANDOFF_RE.test(answer)) {
  escalate = true;
  answer = answer.replace(HANDOFF_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

if (!answer || norm === 'ESCALATE') {
  escalate = true;
  answer = 'Thanks for your question! I want to make sure you get an accurate answer, so I\'ve passed this to the '
    + cfg.companyName + ' team. You can also reach us anytime at ' + cfg.supportContact + ' and we\'ll be glad to help.';
}

// Safety net: if we're handing off but the reply didn't say how to reach us, add it.
if (escalate && answer && !answer.includes('@') && cfg.supportContact) {
  answer += '\n\nYou can also reach our team directly at ' + cfg.supportContact + '.';
}

// ---- Conversation memory: persist this exchange for the session ----
// Best-effort; never let a memory write break the reply.
try {
  const sd = $getWorkflowStaticData('global');
  sd.sessions = sd.sessions || {};
  const sess = sd.sessions[ret.sessionId] || { turns: [], summary: '' };
  sess.turns = sess.turns || [];
  sess.turns.push({ role: 'user', text: ret.message });
  sess.turns.push({ role: 'model', text: answer });
  // Hard safety cap; the post-response summarizer folds older turns into a
  // rolling summary so durable facts survive even very long conversations.
  const maxTurns = Number(cfg.memoryMaxTurns || 24);
  if (sess.turns.length > maxTurns) sess.turns = sess.turns.slice(-maxTurns);
  sess.updated = Date.now();
  sd.sessions[ret.sessionId] = sess;
  // Cap total stored sessions (prune oldest) so static data can't grow forever.
  const keys = Object.keys(sd.sessions);
  if (keys.length > 500) {
    keys.sort((a, b) => (sd.sessions[a].updated || 0) - (sd.sessions[b].updated || 0));
    for (let i = 0; i < keys.length - 500; i++) delete sd.sessions[keys[i]];
  }
} catch (e) {
  /* memory is best-effort */
}

return [{ json: {
  reply: answer,
  escalate,
  score: ret.score,
  sources: ret.sources,
  message: ret.message,
  sessionId: ret.sessionId,
} }];
