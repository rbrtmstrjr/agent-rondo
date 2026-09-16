// Glue: Render answers video/mp4 on success and JSON {error} otherwise. Saved
// as a file, both arrive as a binary, so sniff the bytes. On success compose
// the ready-to-paste caption once (buildPostMessage, as build 06 does), the
// Slack message and the cost.
const cfg = $('Config').first().json;
const run = $('Set Row').first().json;
const script = $('Validate Script').first().json.script;
const pics = $('Collect Images').first().json;
const plan = $('Build Render Payload').first().json;
const fail = (why) => [{ json: { ok: false, status: 'failed',
  message: 'FishPin video ' + run.id + ': the render failed, no video was delivered. ' + why } }];

const bin = ($input.first().binary || {}).data;
if (!bin) return fail('The render service returned no file: ' + JSON.stringify($json.error || $json).slice(0, 300));
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
if (buf.length < 50000 || buf.slice(4, 8).toString('latin1') !== 'ftyp') {
  return fail('Render service error: ' + buf.toString('utf8', 0, Math.min(buf.length, 400)));
}

const veoUsed = $('Check Veo Poll').isExecuted && $('Check Veo Poll').first().json.state === 'done';
const cost = estCost({ veoUsed, veoSeconds: Number(cfg.veoSeconds), images: pics.image_count });
const postMessage = buildPostMessage(
  { caption: script.description, cta: cfg.postCta, hashtags: script.hashtags },
  { websiteUrl: cfg.websiteUrl, playStoreUrl: cfg.playStoreUrl });
const sceneLines = script.scenes.map((sc, i) => (i + 1) + '. ' + sc.beat + ' · ' + sc.type + ' · ' + sc.seconds + 's · '
  + (sc.type === 'screen' ? 'app screen "' + sc.screen + '"' : sc.prompt)).join('\n');
const lines = [
  '*FishPin video ad* · `' + run.id + '` · _' + script.pillar + '_',
  '', '*Hook:* ' + script.hook, '*Topic:* ' + script.topic,
  '', '*Voiceover:*', script.voiceover,
  '', '*Scenes:*', sceneLines,
];
if (plan.hook_fallback) lines.push('', ':warning: The Veo hook clip was not available, so the hook uses the still image. ' + plan.veo_note);
lines.push('', '*Caption to paste on Facebook:*', postMessage, '', 'Estimated cost: $' + cost.toFixed(2) + '.');

return [{ json: {
  ok: true, bytes: buf.length, file_name: run.id + '.mp4',
  message_text: lines.join('\n'), post_message: postMessage, est_cost: cost,
}, binary: { video: bin } }];
