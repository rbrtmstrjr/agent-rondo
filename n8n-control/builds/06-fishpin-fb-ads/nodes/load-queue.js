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

const wh = $('Loop Webhook').isExecuted ? ($('Loop Webhook').first().json.body || {}) : {};
const rowId = String(wh.row_id || '');

const row = selectRow(rows, rowId);
if (!row) return [{ json: { found: false, reason: 'No rows with status=ready.' } }];

return [{ json: {
  found: true,
  row,
  attempt: Number(wh.attempt || 1),
  copy_retry: Number(wh.copy_retry || 0),
  revision_note: String(wh.revision_note || ''),
  rejected_headline: String(wh.headline || ''),
  keep_copy: String(wh.decision || '') === 'image',
  prior_caption: String(wh.caption || ''),
  sheetId: cfg.sheetId,
} }];
