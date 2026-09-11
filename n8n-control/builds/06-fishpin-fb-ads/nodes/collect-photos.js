// Glue: aggregate the N unpublished photo uploads into ONE album item.
//
// This is the join that turns the per-image fan-out back into a single post:
// it builds `attached_media` for POST /{pageId}/feed (the two-step pattern
// proven in sv91rOvu8Bec8sLc), collects the public CDN urls for the Slack
// preview and the Attempts log, and carries the shared copy through.
//
// It is also the fail-closed gate's evidence. With one photo, Image URL OK?
// could test images[0].source directly; with 1 to 5 it cannot, because a
// per-item IF would send the GOOD items down the true branch and publish a
// PARTIAL album. So every photo is checked here and the result is a single
// all-or-nothing `ok` flag that Image URL OK? gates on.
//
// `items` is Get Photo URL's output, one per uploaded photo, in order.
// $('Node').first() is deliberately not used on any fan-out node: it always
// returns index 0 regardless of the item being processed.
const jobs = $('Build Image Prompt').all();
const vi = $('Validate Image').all();
const expected = jobs.length;

// Every job carries the same `copy` object by construction (Build Image Prompt
// re-emits it on each item), so index 0 IS the shared copy rather than one
// item's private value. Written as .all()[0] rather than .first() so the
// no-.first()-on-a-fan-out-node rule holds without exception.
const copy = (jobs[0] && jobs[0].json.copy) || {};

// THE ONE PLACE the published post is composed. buildPostMessage (inlined from
// lib/copy-rules.js) puts the prose caption, the call to action, both Config
// links and the hashtags together in one fixed order, and the SAME string is
// read by Publish Post (the Facebook /feed body) and by Post Preview (what the
// reviewer sees in Slack) — so the reviewer approves character-for-character
// what gets published. Those two nodes used to build their own message in
// their own expressions, and the copy prompt asked the model for the CTA and
// the links as well, which is why the first live post carried the CTA twice.
const cfg = $('Config').first().json;
const message = buildPostMessage(copy, {
  websiteUrl: cfg.websiteUrl,
  playStoreUrl: cfg.playStoreUrl,
});

const media = [];
const urls = [];
const problems = [];

for (let i = 0; i < items.length; i++) {
  const j = items[i].json || {};
  const id = j.id ? String(j.id) : '';
  const src = (j.images && j.images.length && j.images[0] && j.images[0].source)
    ? String(j.images[0].source) : '';
  if (!id) {
    problems.push('Photo ' + (i + 1) + ' of ' + items.length + ' came back with no media_fbid, so it cannot be attached to the post.');
    continue;
  }
  if (!src) {
    problems.push('Photo ' + (i + 1) + ' of ' + items.length + ' (' + id + ') has no public image url, so the reviewer could not have seen it.');
    continue;
  }
  media.push({ media_fbid: id });
  urls.push(src);
}

if (items.length !== expected) {
  problems.push('Uploaded ' + items.length + ' photos but ' + expected + ' images were generated.');
}

// Spec §16 item 1 / §7: record the aspect ratio the model actually produced,
// and flag it when it does not match what was requested. Never a failure. The
// whole set shares one requested ratio (it is derived from the pillar), so the
// first observation represents the set; a MISMATCH anywhere flags the cell.
const firstAspect = vi.length ? (vi[0].json || {}) : {};
const anyMismatch = vi.some((x) => (x.json || {}).aspectMatches === false);
const aspect = anyMismatch
  ? String(firstAspect.aspect) + ' (requested ' + String(firstAspect.aspectRequested) + ', MISMATCH)'
  : String(firstAspect.aspect || '');

const ok = problems.length === 0 && media.length === expected && media.length >= 1;

return [{ json: {
  ok,
  reason: problems.join(' '),
  copy,
  // The exact text that will be published. Never rebuild it downstream.
  message,
  // A JSON array string, exactly what the /feed edge's attached_media expects.
  // One entry is a valid album body too, so a single-image post takes the same
  // path as a five-image one.
  attached_media: JSON.stringify(media),
  media_fbids: media.map((m) => m.media_fbid),
  image_count: media.length,
  expected,
  urls,
  // The Attempts and Queue tabs each have ONE image_url column, so the whole
  // set shares it, joined. The count is the number of entries.
  image_url: urls.join(' | '),
  aspect,
} }];
