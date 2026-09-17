// Glue: pick the row to work on. On loop re-entry the webhook names a row id.
// The Sheets values endpoint returns ONE item holding a `values` matrix, not one
// item per row, so parse it here. _rowNumber is what every later write targets.
const cfg = $('Config').first().json;
const vals = ($json.values || []);
const headers = vals[0] || [];
const rows = vals.slice(1).map((r, i) => {
  const o = { _rowNumber: i + 2 }; // +1 for the header, +1 because sheets are 1-based
  headers.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
  return o;
});

const stop = (reason) => [{ json: { found: false, reason } }];

// A run started from the Manual Trigger in the n8n editor only loads the
// nodes on that trigger's own path — Loop Webhook is a separate trigger, not
// an ancestor of Pick Row on that path, so n8n doesn't even instantiate it
// for the run. `$('Loop Webhook')` then throws "Referenced node doesn't
// exist" instead of returning an object with isExecuted:false (which is what
// it does on a Schedule Trigger run, where every trigger node DOES exist in
// the graph). Resolve it defensively so editor Execute runs behave exactly
// like a scheduled run: no webhook body, so the two guards below both take
// their unauthenticated/no-row-id branch, same as today.
let fromWebhook = false;
try { fromWebhook = $('Loop Webhook').isExecuted; } catch (e) { fromWebhook = false; }
const wh = fromWebhook ? ($('Loop Webhook').first().json.body || {}) : {};

// --- guard 1: the loop webhook is a public POST endpoint -------------------
// Only Loop Guard is supposed to call it. Without a shared secret anyone with
// the URL could resurrect a row that ships as blocked_needs_asset (spec §10:
// social proof is NEVER machine-generated), repost an already-posted row, or
// supply an arbitrary revision_note, which brand.js injects verbatim into the
// Gemini prompt. Config.loopSecret is the shared secret; Loop Guard puts it in
// the re-invoke payload.
if (fromWebhook) {
  const expected = String(cfg.loopSecret || '');
  const supplied = String(wh.loop_secret || '');
  if (!expected || expected.indexOf('FILL_IN') === 0) {
    return stop('Loop webhook rejected: Config.loopSecret is still the placeholder. '
      + 'Set a real secret in the Config node before the loop can be used.');
  }
  if (supplied !== expected) {
    return stop('Loop webhook rejected: missing or incorrect loop_secret. '
      + 'This endpoint only accepts re-invocations from this workflow, not arbitrary callers.');
  }
}

const rowId = String(wh.row_id || '');
const row = selectRow(rows, rowId);
if (!row) {
  return stop(rowId
    ? 'No row with id "' + rowId + '" exists in the ' + cfg.queueTab + ' tab.'
    : 'No rows with status=ready.');
}

// --- guard 2: a named row is only legitimate mid-flight --------------------
// selectRow matches a supplied id by id alone (that contract is shared with
// the insights workflow and stays as it is). The status rule belongs here:
// in_review is the only state a row can legitimately be re-entered in, because
// Claim Row set it on the way into the review that produced this loop. Every
// other status is either terminal or not yet claimed.
if (rowId) {
  const status = String(row.status || '').trim().toLowerCase();
  if (status !== 'in_review') {
    return stop('Row "' + rowId + '" has status "' + (row.status || '(blank)')
      + '", not in_review. The loop webhook may only re-enter a row that is mid-flight in the '
      + 'review loop; terminal rows (posted, measured, needs_manual, expired, failed, '
      + 'blocked_needs_asset) and unclaimed ready rows are never re-entered this way.');
  }
}

// The full approved copy, carried back through the re-invoke payload. On a
// "Regenerate image" pass this is what Reuse Copy replays so copy generation
// is skipped entirely (spec §8).
const priorCopy = (wh.prior_copy && typeof wh.prior_copy === 'object') ? wh.prior_copy : {};
// keep_copy requires the copy to have actually survived the round trip.
// Without a caption and a headline there is nothing to reuse, so fall back to
// regenerating rather than publishing an empty ad. The image_prompts array is
// checked for the same reason: it is what decides how many images the post has
// and what each one shows, so an empty one would leave Build Image Prompt with
// nothing to fan out over.
const keepCopy = String(wh.decision || '') === 'image'
  && String(priorCopy.caption || '').trim() !== ''
  && String(priorCopy.headline || '').trim() !== ''
  && Array.isArray(priorCopy.image_prompts) && priorCopy.image_prompts.length > 0;

// --- what has already been published ---------------------------------------
// The owner's rule: a topic may come round again, but never with the same
// wording or the same angle. So every row that actually made it to the Page
// (posted, and measured once the insights workflow has scored it) hands its
// topic and its published caption forward as `prior_posts`. Build Copy Prompt
// lists them back to the model as "already published, take a different angle",
// and Validate Copy rejects an exact repeat of any of them.
//
// Capped at the most recent PRIOR_POSTS_MAX rows: the Queue tab only grows, and
// an uncapped list would put every caption ever written in front of every
// generation. Sheet order is publication order (rows are appended as ideas are
// queued and marked posted in place), so the tail of the filtered list is the
// most recent. The current row is excluded so a re-entry can never be told it
// is repeating itself.
const PRIOR_POSTS_MAX = 15;
const PUBLISHED_STATUSES = ['posted', 'measured'];
const priorPosts = rows
  .filter((r) => PUBLISHED_STATUSES.indexOf(String(r.status || '').trim().toLowerCase()) !== -1)
  .filter((r) => String(r.id || '') !== String(row.id || ''))
  .map((r) => ({
    id: String(r.id || ''),
    topic: String(r.topic || ''),
    caption: String(r.caption || ''),
  }))
  .filter((r) => r.topic.trim() !== '' || r.caption.trim() !== '')
  .slice(-PRIOR_POSTS_MAX);

return [{ json: {
  found: true,
  row,
  prior_posts: priorPosts,
  attempt: Number(wh.attempt || 1),
  copy_retry: Number(wh.copy_retry || 0),
  revision_note: String(wh.revision_note || ''),
  rejected_headline: String(wh.headline || ''),
  keep_copy: keepCopy,
  prior_copy: priorCopy,
  sheetId: cfg.sheetId,
} }];
