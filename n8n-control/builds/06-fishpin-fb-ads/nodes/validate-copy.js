// Glue: parse the Gemini response and run every deterministic copy rule.
const cfg = $('Config').first().json;
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

const r = validateCopy(copy, {
  bannedWords: BANNED_WORDS,
  competitors: COMPETITORS,
  price: Number(cfg.appPrice),
});

return [{ json: {
  valid: r.valid, reasons: r.reasons, copy,
  attempt: q.attempt, copy_retry: q.copy_retry, row: q.row,
} }];
