// Glue: the video counts as delivered only when Slack confirms both the file
// upload and the message. Only then is the row marked delivered.
const cfg = $('Config').first().json;
const run = $('Set Row').first().json;
const script = $('Validate Script').first().json.script;
const rendered = $('Check Render').first().json;
const complete = $('Slack Complete').first().json;
const fail = (why) => [{ json: { ok: false, status: 'failed',
  message: 'FishPin video ' + run.id + ': the video was rendered but ' + why } }];
if (!complete.ok) return fail('Slack did not finish the video upload (' + (complete.error || 'unknown') + ').');
if (!$json.ok || !$json.ts) return fail('the Slack message was not delivered (' + ($json.error || 'unknown') + ').');
const videoUrl = String(((complete.files || [])[0] || {}).permalink || '');
return [{ json: {
  ok: true, ts: $json.ts, video_url: videoUrl,
  sheet_body: statusUpdate(cfg.videosTab, run.row_number, {
    pillar: script.pillar, topic: script.topic, hook: script.hook, voiceover: script.voiceover,
    status: 'delivered', video_url: videoUrl, est_cost_usd: Number(rendered.est_cost).toFixed(2),
  }),
} }];
