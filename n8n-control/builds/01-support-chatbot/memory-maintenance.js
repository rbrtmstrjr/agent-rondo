// ============================================================================
// Memory Maintenance — Code node (no credentials). Runs AFTER the reply is sent.
// If the verbatim turn buffer has grown past the summarize threshold, it builds
// a prompt to fold the older turns into a rolling MEMORY NOTE (durable facts).
// Outputs { skip:true } when no summarization is needed.
// ============================================================================

const cfg = $('Config').first().json;
const ret = $('Decide').first().json;
const sid = ret.sessionId;

let out = { skip: true, sessionId: sid };
try {
  const sd = $getWorkflowStaticData('global');
  sd.sessions = sd.sessions || {};
  const sess = sd.sessions[sid] || { turns: [], summary: '' };
  const turns = sess.turns || [];

  const summarizeAt = Number(cfg.memorySummarizeAt || 16);
  const keep = Number(cfg.memoryKeep || 12);

  if (turns.length > summarizeAt) {
    const overflow = turns.slice(0, turns.length - keep);
    const convoText = overflow
      .map((t) => (t.role === 'user' ? 'Customer: ' : 'Assistant: ') + String(t.text || ''))
      .join('\n');

    const prompt = 'You maintain a concise running MEMORY NOTE for an ongoing customer-support chat for ' + (cfg.companyName || 'the company') + '. '
      + 'Rewrite the memory note so it captures the durable facts worth remembering about THIS customer and conversation: '
      + 'their name, where they live, their home issue or the service they need, their concerns or sentiment, and anything you promised or recommended. '
      + 'Be factual and third-person, no fluff, under 150 words. Merge the existing note with the new lines; drop nothing important.\n\n'
      + 'EXISTING MEMORY NOTE:\n' + (sess.summary || '(none yet)') + '\n\n'
      + 'NEW CONVERSATION LINES TO FOLD IN:\n' + convoText + '\n\nUPDATED MEMORY NOTE:';

    out = {
      skip: false,
      sessionId: sid,
      summaryBody: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 320 },
      },
    };
  }
} catch (e) {
  out = { skip: true, sessionId: sid, error: String((e && e.message) || e) };
}

return [{ json: out }];
