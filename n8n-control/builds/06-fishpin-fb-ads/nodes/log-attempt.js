// Glue: shape the Attempts row. Runs before the review so a timed-out or
// abandoned attempt is still on the record.
//
// The copy comes from Build Image Prompt, not Validate Copy: on the
// "Regenerate image" branch Validate Copy never executes (see reuse-copy.js).
const q = $('Pick Row').first().json;
const v = $('Build Image Prompt').first().json;
const vi = $('Validate Image').first().json;
const img = $('Get Photo URL').first().json;
const url = (img && img.images && img.images.length) ? img.images[0].source : '';

// Spec §16 item 1 / §7: record the aspect ratio the model actually produced,
// and flag it when it does not match what was requested. Never a failure —
// this column exists so the mismatch is visible in the Attempts tab.
const aspect = vi.aspectMatches === false
  ? String(vi.aspect) + ' (requested ' + String(vi.aspectRequested) + ', MISMATCH)'
  : String(vi.aspect || '');

return [{ json: buildAttemptRow({
  row_id: q.row.id, attempt: q.attempt, pillar: q.row.pillar,
  headline: v.copy.headline, caption: v.copy.caption,
  image_url: url, decision: 'pending', revision_note: q.revision_note,
  aspect,
}) }];
