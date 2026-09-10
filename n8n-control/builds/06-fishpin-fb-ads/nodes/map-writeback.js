// Glue: shape the Queue row update after a successful publish. On failure,
// still stamp a terminal status: the Published? gate downstream routes a
// failed publish to Mark Terminal instead of Write Back Row, and Mark
// Terminal needs a status to write so the row does not stay stranded at
// in_review forever.
const d = $('Route Decision').first().json;
const pub = $json;

if (pub && pub.error) {
  return [{ json: { ok: false, error: JSON.stringify(pub.error), id: d.row_id, status: 'failed' } }];
}

// _rowNumber is what the targeted batchUpdate writes against.
const rowNumber = $('Pick Row').first().json.row._rowNumber;

return [{ json: Object.assign({ ok: true, _rowNumber: rowNumber }, buildQueueUpdate({
  id: d.row_id, status: 'posted', caption: d.copy.caption,
  image_url: d.image_url, fb_post_id: pub.id || '',
})) }];
