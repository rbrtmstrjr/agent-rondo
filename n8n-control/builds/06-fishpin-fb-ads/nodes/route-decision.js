// Glue: normalise whatever the Slack custom form returned.
const q = $('Pick Row').first().json;
const v = $('Validate Copy').first().json;
const img = $('Get Photo URL').first().json;
const url = (img && img.images && img.images.length) ? img.images[0].source : '';

const decision = normalizeDecision($json);
const reason = extractReason($json);

return [{ json: {
  decision, reason,
  approved: decision === 'approve',
  row_id: q.row.id, pillar: q.row.pillar,
  attempt: q.attempt, copy_retry: q.copy_retry,
  copy: v.copy, image_url: url,
  media_fbid: $('Upload Photo (unpublished)').first().json.id,
} }];
