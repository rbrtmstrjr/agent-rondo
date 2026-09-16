// Glue: runs once per 15-second poll ($runIndex counts them). pending loops back
// to Wait Veo; done carries the clip uri; failed falls back to the still.
const cfg = $('Config').first().json;
const maxPolls = Number(cfg.veoMaxWaitMinutes || 8) * 4;
const polls = $runIndex + 1;
const r = $json || {};
if (r.done === true) {
  const resp = (r.response && r.response.generateVideoResponse) || {};
  const uri = (((resp.generatedSamples || [])[0] || {}).video || {}).uri || '';
  if (!r.error && uri) return [{ json: { state: 'done', uri, reason: '', polls } }];
  const filtered = (resp.raiMediaFilteredReasons || []).join(' ');
  return [{ json: { state: 'failed', uri: '', polls,
    reason: 'Veo finished without a clip: ' + (filtered || JSON.stringify(r.error || resp).slice(0, 300)) } }];
}
// A not-done response carrying {error} is a transient transport blip (retries,
// timeouts), not Veo saying the job failed: an already-paid $0.64 clip is
// still generating. Keep polling instead of discarding it; only the poll cap
// below gives up, and it surfaces the last transport error when it does.
if (r.error) {
  const errText = 'Veo poll error: ' + JSON.stringify(r.error).slice(0, 300);
  if (polls >= maxPolls) return [{ json: { state: 'failed', uri: '', polls,
    reason: 'Veo did not finish within ' + (maxPolls / 4) + ' minutes. ' + errText } }];
  return [{ json: { state: 'pending', uri: '', reason: errText, polls } }];
}
if (polls >= maxPolls) return [{ json: { state: 'failed', uri: '', polls, reason: 'Veo did not finish within ' + (maxPolls / 4) + ' minutes.' } }];
return [{ json: { state: 'pending', uri: '', reason: '', polls } }];
