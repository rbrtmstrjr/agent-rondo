// Glue: pull the image bytes out of EVERY Gemini response in the set and
// verify them.
//
// ALL-OR-NOTHING. If ANY image of the album fails validation, this returns a
// single rejection item instead of the good ones, so Image Valid? routes the
// whole run to Notify Image Failed -> Mark Terminal. A partial album must never
// be published: a how-to post whose step 3 is missing is worse than no post,
// and the reviewer would be approving something different from what was asked
// for. Getting the missing image back means re-running the row, not shipping
// four fifths of it.
//
// Index alignment: Generate Image is 1:1 per item and order-preserving, so
// items[i] is the response to $('Build Image Prompt').all()[i]. .first() is
// deliberately not used anywhere here — on a fan-out node it always returns
// index 0 regardless of the item being processed, which is exactly the silent
// collapse bug already fixed once in the insights workflow.
const jobs = $('Build Image Prompt').all();

const extract = (res) => {
  try {
    const parts = res.candidates[0].content.parts || [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    const d = img ? (img.inlineData || img.inline_data) : null;
    if (d) return { b64: d.data || '', mime: (d.mimeType || d.mime_type || '').toLowerCase() };
  } catch (e) { /* falls through to the empty-payload rejection */ }
  return { b64: '', mime: '' };
};

const out = [];
const failures = [];

if (items.length !== jobs.length) {
  failures.push('Expected ' + jobs.length + ' images but the model returned ' + items.length + '.');
}

for (let i = 0; i < items.length; i++) {
  const meta = jobs[i] ? jobs[i].json : {};
  const got = extract(items[i].json);
  // The requested aspect ratio is handed to validateImage so it can compare it
  // against the ratio actually observed in the returned bytes (spec §16 item 1).
  // A mismatch is recorded, never enforced: r.valid ignores it entirely, and
  // Log Attempt writes the observation into the Attempts tab's `aspect` column.
  const r = validateImage(got, { minBytes: 20480, aspectRequested: meta.aspectRequested });
  if (!r.valid) {
    failures.push('Image ' + (i + 1) + ' of ' + items.length + ': ' + r.reasons.join('; '));
    continue;
  }
  out.push({
    json: {
      valid: true, reasons: [], bytes: r.bytes, width: r.width, height: r.height,
      aspect: r.aspect, aspectRequested: r.aspectRequested, aspectMatches: r.aspectMatches,
      index: i, total: jobs.length,
    },
    binary: { data: await this.helpers.prepareBinaryData(
      Buffer.from(got.b64, 'base64'), 'creative-' + (i + 1) + '.png', got.mime || 'image/png') },
  });
}

if (failures.length || out.length === 0) {
  return [{ json: {
    valid: false,
    reasons: failures.length ? failures : ['No images returned by the model.'],
    total: jobs.length, okCount: out.length,
  } }];
}
return out;
