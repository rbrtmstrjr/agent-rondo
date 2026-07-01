// ============================================================================
// Apply Summary — Code node (no credentials). Runs after the summarizer LLM call.
// Writes the updated MEMORY NOTE and trims the verbatim turn buffer to the last
// `memoryKeep` turns. Best-effort; never throws.
// ============================================================================

const cfg = $('Config').first().json;
const mm = $('Memory Maintenance').first().json;
const sid = mm.sessionId;
const chat = $json; // Summarize response

let newSummary = '';
try {
  newSummary = chat.candidates[0].content.parts.map((p) => p.text || '').join('').trim();
} catch (e) {
  newSummary = '';
}

try {
  if (newSummary) {
    const sd = $getWorkflowStaticData('global');
    sd.sessions = sd.sessions || {};
    const sess = sd.sessions[sid];
    if (sess) {
      const keep = Number(cfg.memoryKeep || 12);
      sess.summary = newSummary.slice(0, 1500);
      sess.turns = (sess.turns || []).slice(-keep);
      sess.updated = Date.now();
      sd.sessions[sid] = sess;
    }
  }
} catch (e) {
  /* best-effort */
}

return [{ json: { ok: true, sessionId: sid, summaryUpdated: Boolean(newSummary) } }];
