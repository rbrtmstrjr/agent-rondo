// Glue: shape the Attempts row. Runs before the review so a timed-out or
// abandoned attempt is still on the record.
const q = $('Pick Row').first().json;
const v = $('Validate Copy').first().json;
const img = $('Get Photo URL').first().json;
const url = (img && img.images && img.images.length) ? img.images[0].source : '';

return [{ json: buildAttemptRow({
  row_id: q.row.id, attempt: q.attempt, pillar: q.row.pillar,
  headline: v.copy.headline, caption: v.copy.caption,
  image_url: url, decision: 'pending', revision_note: q.revision_note,
}) }];
