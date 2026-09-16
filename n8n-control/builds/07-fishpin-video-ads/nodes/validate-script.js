// Glue: parse and validate the script. $runIndex counts the tries in this
// execution; under Config.maxScriptRetries the reasons loop back to Build
// Script Request, at the cap the run stops as needs_manual.
const cfg = $('Config').first().json;
const run = $('Set Row').first().json;
const tries = $runIndex + 1;
const maxTries = Number(cfg.maxScriptRetries || 3);

let script = null;
let reasons = [];
const parts = ((($json.candidates || [])[0] || {}).content || {}).parts || [];
const text = parts.map((p) => p.text || '').join('');
if (!text) {
  reasons = ['Gemini returned no script: ' + JSON.stringify($json.error || $json).slice(0, 300)];
} else {
  try { script = JSON.parse(text); } catch (e) { reasons = ['The script was not valid JSON: ' + e.message]; }
}
if (script) {
  reasons = validateScript(script, {
    checkProse, bannedWords: BANNED_WORDS, competitors: COMPETITORS,
    pillars: Object.keys(PILLARS), priorVideos: run.prior_videos || [],
  }).reasons;
}
if (!reasons.length) return [{ json: { valid: true, script, script_try: tries } }];
return [{ json: {
  valid: false, reasons, script_try: tries, retry: tries < maxTries,
  ok: false, status: 'needs_manual',
  message: 'FishPin video ' + run.id + ': the script failed validation ' + tries + ' times, needs a human. Last reasons: '
    + reasons.join(' | '),
} }];
