// Glue: normalise whatever the Slack approval gate returned.
//
// routeApproval, not normalizeDecision: the Slack Review node is a native
// two-button sendAndWait, whose only two outputs are {data:{approved:bool}}
// (a click) and a passthrough of its own input (a 2-hour limitWaitTime
// expiry). routeApproval is what encodes that distinction, so a decline
// ('both' — regenerate copy AND images) is never mistaken for a timeout and
// vice versa. See lib/flow-rules.js.
//
// The copy and the album both come from Collect Photos, the single-item join:
// on the "Regenerate image" branch Validate Copy never executes (see
// reuse-copy.js), and Upload Photo / Get Photo URL are fan-out nodes that must
// never be read with .first().
const q = $('Pick Row').first().json;
const p = $('Collect Photos').first().json;

const decision = routeApproval($json);
const reason = extractReason($json);

return [{ json: {
  decision, reason,
  approved: decision === 'approve',
  row_id: q.row.id, pillar: q.row.pillar,
  attempt: q.attempt, copy_retry: q.copy_retry,
  copy: p.copy,
  // The exact composed message Collect Photos built and the reviewer just saw
  // in the Slack preview. Publish Post sends THIS, verbatim: it is never
  // rebuilt from copy.caption/cta/hashtags in a node expression again.
  message: p.message,
  image_url: p.image_url,
  urls: p.urls,
  image_count: p.image_count,
  // A JSON array string of every media_fbid, ready for /feed's attached_media.
  attached_media: p.attached_media,
} }];
