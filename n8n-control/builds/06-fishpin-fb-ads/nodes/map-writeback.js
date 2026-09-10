// Glue: shape the Queue row update after a successful publish.
const d = $('Route Decision').first().json;
const pub = $json;

if (pub && pub.error) {
  return [{ json: { ok: false, error: JSON.stringify(pub.error), id: d.row_id } }];
}

// _rowNumber is what the targeted batchUpdate writes against.
const rowNumber = $('Pick Row').first().json.row._rowNumber;

return [{ json: Object.assign({ ok: true, _rowNumber: rowNumber }, buildQueueUpdate({
  id: d.row_id, status: 'posted', caption: d.copy.caption,
  image_url: d.image_url, fb_post_id: pub.id || '',
})) }];
