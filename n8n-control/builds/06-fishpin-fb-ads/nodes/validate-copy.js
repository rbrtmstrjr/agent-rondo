// Glue: parse the Gemini response and run every deterministic copy rule.
const q = $('Pick Row').first().json;
const res = $json;

let copy = null; let parseError = '';
try {
  const txt = res.candidates[0].content.parts[0].text;
  copy = JSON.parse(txt);
} catch (e) {
  parseError = 'Could not parse the model response: ' + (e.message || e);
}

if (!copy) {
  return [{ json: { valid: false, reasons: [parseError], copy: null, attempt: q.attempt, copy_retry: q.copy_retry } }];
}

const cfg = $('Config').first().json;

const r = validateCopy(copy, {
  bannedWords: BANNED_WORDS,
  competitors: COMPETITORS,
  // The same two Config values Build Copy Prompt put in the prompt: a caption
  // missing either link is rejected and regenerated.
  websiteUrl: cfg.websiteUrl,
  playStoreUrl: cfg.playStoreUrl,
  // Already-published topics and captions, from Pick Row. An EXACT repeat
  // (whitespace and case normalised) is rejected with a reason telling the
  // model to change the angle.
  priorPosts: q.prior_posts,
});

return [{ json: {
  valid: r.valid, reasons: r.reasons, copy,
  attempt: q.attempt, copy_retry: q.copy_retry, row: q.row,
} }];
