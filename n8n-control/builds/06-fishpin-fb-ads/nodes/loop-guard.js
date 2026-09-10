// Glue: apply the two retry budgets and build the re-invoke payload.
const cfg = $('Config').first().json;
// The 'Copy Valid?' false branch feeds this node directly, bypassing
// 'Route Decision' entirely. When that happened, synthesize the decision
// the copy-retry path needs from Validate Copy's own output instead.
//
// The Validate Copy read is deliberately INSIDE the branch: on the
// "Regenerate image" branch Validate Copy never executes (see reuse-copy.js),
// and $('Validate Copy') on an un-executed node throws. That branch always
// arrives here through Route Decision, so it never touches this read.
const routed = $('Route Decision').isExecuted;
const d = routed ? $json : (function () {
  const v = $('Validate Copy').first().json;
  return {
    decision: 'copy_invalid', attempt: v.attempt, copy_retry: v.copy_retry,
    reason: (v.reasons || []).join('; '), row_id: (v.row && v.row.id) || '',
    copy: v.copy,
  };
}());

const g = loopGuard({
  decision: d.decision, attempt: d.attempt, copy_retry: d.copy_retry,
  reason: d.reason, row_id: d.row_id,
}, { maxAttempts: Number(cfg.maxAttempts), maxCopyRetries: Number(cfg.maxCopyRetries) });

// The full copy, so a "Regenerate image" re-entry can replay the approved
// words instead of generating new ones (spec §8). Every field the image
// prompt, the Slack preview and the publish body read has to survive the
// round trip through the webhook, so the whole object goes.
const c = d.copy || {};
const priorCopy = {
  headline: String(c.headline || ''),
  subhead: String(c.subhead || ''),
  caption: String(c.caption || ''),
  cta: String(c.cta || ''),
  hashtags: Array.isArray(c.hashtags) ? c.hashtags : [],
  image_prompt: String(c.image_prompt || ''),
  alt_text: String(c.alt_text || ''),
};

return [{ json: Object.assign({}, g, {
  row_id: d.row_id,
  reinvoke: g.action === 'reinvoke',
  payload: {
    row_id: d.row_id, attempt: g.attempt, copy_retry: g.copy_retry,
    decision: d.decision, revision_note: g.revision_note,
    // Shared secret: load-queue.js refuses a webhook call without it.
    loop_secret: String(cfg.loopSecret || ''),
    caption: priorCopy.caption, headline: priorCopy.headline,
    prior_copy: priorCopy,
  },
}) }];
