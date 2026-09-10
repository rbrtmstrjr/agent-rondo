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

const fromWebhook = $('Loop Webhook').isExecuted;
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
// regenerating rather than publishing an empty ad.
const keepCopy = String(wh.decision || '') === 'image'
  && String(priorCopy.caption || '').trim() !== ''
  && String(priorCopy.headline || '').trim() !== '';

return [{ json: {
  found: true,
  row,
  attempt: Number(wh.attempt || 1),
  copy_retry: Number(wh.copy_retry || 0),
  revision_note: String(wh.revision_note || ''),
  rejected_headline: String(wh.headline || ''),
  keep_copy: keepCopy,
  prior_copy: priorCopy,
  sheetId: cfg.sheetId,
} }];
