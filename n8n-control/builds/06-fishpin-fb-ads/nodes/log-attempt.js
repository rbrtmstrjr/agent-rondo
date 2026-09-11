// Glue: shape the Attempts row. Runs before the review so a timed-out or
// abandoned attempt is still on the record.
//
// Everything is read from Collect Photos, the single-item join that aggregates
// the whole album: the copy (which on the "Regenerate image" branch came from
// Reuse Copy, not Validate Copy, so naming Validate Copy here would throw), the
// joined image urls, and the observed aspect ratio.
const q = $('Pick Row').first().json;
const p = $('Collect Photos').first().json;

return [{ json: buildAttemptRow({
  row_id: q.row.id, attempt: q.attempt, pillar: q.row.pillar,
  headline: p.copy.headline, caption: p.copy.caption,
  // One column, 1 to 5 urls, joined by ' | '. ATTEMPT_HEADERS is unchanged.
  image_url: p.image_url,
  decision: 'pending', revision_note: q.revision_note,
  aspect: p.aspect,
}) }];
