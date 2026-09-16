// Glue: shape the /render-ad request. Reached with the downloaded clip (Veo
// Download) or without one (Veo never started, or finished with no clip), in
// which case scene-plan.js swaps in the zoom-punched still. The JSON goes to
// Render as a binary so a ~10 MB body never passes through an n8n expression.
const cfg = $('Config').first().json;
const run = $('Set Row').first().json;
const script = $('Validate Script').first().json.script;
const pics = $('Collect Images').first().json;
const voice = $('Voice WAV').first().json;
const fail = (why) => [{ json: { ok: false, status: 'failed', message: 'FishPin video ' + run.id + ': ' + why } }];

const token = String(cfg.renderToken || '');
if (!token || token.indexOf('FILL_IN') === 0) {
  return fail('Config.renderToken is still the placeholder, so the render service would refuse the request.');
}

let clipB64 = '';
let veoNote = '';
const bin = ($input.first().binary || {}).data;
if ($('Veo Download').isExecuted && bin) {
  const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
  // MP4 files carry "ftyp" at byte 4, whatever content type the server sent.
  if (buf.length >= 100000 && buf.slice(4, 8).toString('latin1') === 'ftyp') clipB64 = buf.toString('base64');
  else veoNote = 'The Veo download was not a usable video (' + buf.length + ' bytes, ' + (bin.mimeType || 'no type') + ').';
} else if ($('Veo Download').isExecuted) {
  veoNote = 'The Veo download failed: ' + JSON.stringify($json.error || $json).slice(0, 200);
} else if ($('Check Veo Poll').isExecuted) {
  veoNote = $('Check Veo Poll').first().json.reason;
} else {
  veoNote = $('Check Veo Start').first().json.reason;
}

const r = buildRenderPayload(script,
  { voiceoverB64: voice.wav_b64, hookClipB64: clipB64, hookStillB64: pics.hook_still_b64, imagesB64: pics.images_b64 },
  { endCardCta: cfg.endCardCta, websiteUrl: cfg.websiteUrl, endCardSeconds: cfg.endCardSeconds });
if (!r.ok) return fail(r.reason);
const payloadBin = await this.helpers.prepareBinaryData(Buffer.from(JSON.stringify(r.payload), 'utf8'), 'render-ad.json', 'application/json');
return [{ json: { ok: true, hook_fallback: r.hookFallback, veo_note: r.hookFallback ? veoNote : '' }, binary: { payload: payloadBin } }];
