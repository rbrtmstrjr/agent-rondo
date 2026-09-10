// Glue: apply the two retry budgets and build the re-invoke payload.
const cfg = $('Config').first().json;
// The 'Copy Valid?' false branch feeds this node directly, bypassing
// 'Route Decision' entirely. When that happened, synthesize the decision
// the copy-retry path needs from Validate Copy's own output instead.
const routed = $('Route Decision').isExecuted;
const v = $('Validate Copy').first().json;
const d = routed ? $json : {
  decision: 'copy_invalid', attempt: v.attempt, copy_retry: v.copy_retry,
  reason: (v.reasons || []).join('; '), row_id: (v.row && v.row.id) || '',
  copy: v.copy,
};

const g = loopGuard({
  decision: d.decision, attempt: d.attempt, copy_retry: d.copy_retry,
  reason: d.reason, row_id: d.row_id,
}, { maxAttempts: Number(cfg.maxAttempts), maxCopyRetries: Number(cfg.maxCopyRetries) });

return [{ json: Object.assign({}, g, {
  row_id: d.row_id,
  reinvoke: g.action === 'reinvoke',
  payload: {
    row_id: d.row_id, attempt: g.attempt, copy_retry: g.copy_retry,
    decision: d.decision, revision_note: g.revision_note,
    caption: (d.copy && d.copy.caption) || '', headline: (d.copy && d.copy.headline) || '',
  },
}) }];
