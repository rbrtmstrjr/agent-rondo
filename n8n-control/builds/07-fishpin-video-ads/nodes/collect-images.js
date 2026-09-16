// Glue: THE JOIN for Generate Image. All-or-nothing: one missing picture stops
// the run before any Veo spend. HTTP output order matches input order.
const run = $('Set Row').first().json;
const reqs = $('Build Image Requests').all();
const outs = $input.all();
const fail = (why) => [{ json: { ok: false, status: 'failed',
  message: 'FishPin video ' + run.id + ': image generation failed, no video was generated. ' + why } }];
if (outs.length !== reqs.length) return fail('Expected ' + reqs.length + ' images but got ' + outs.length + '.');
const pics = [];
for (let i = 0; i < reqs.length; i++) {
  const j = outs[i].json || {};
  const cand = (j.candidates || [])[0] || {};
  const found = ((cand.content || {}).parts || []).find((p) => p && (p.inlineData || p.inline_data));
  const d = found ? (found.inlineData || found.inline_data) : null;
  if (!d || String(d.data || '').length < 20000) {
    return fail('Image ' + (i + 1) + ' of ' + reqs.length + ' (' + reqs[i].json.role + ') came back empty: '
      + JSON.stringify(j.error || cand.finishReason || 'no image data').slice(0, 200));
  }
  pics.push({ b64: d.data, mime: d.mimeType || d.mime_type || 'image/png' });
}
return [{ json: {
  ok: true, hook_still_b64: pics[0].b64, hook_still_mime: pics[0].mime,
  images_b64: pics.slice(1).map((p) => p.b64), image_count: pics.length,
} }];
