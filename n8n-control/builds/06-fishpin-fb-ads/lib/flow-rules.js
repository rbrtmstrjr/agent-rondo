// ============================================================================
// Approval routing + the two independent retry budgets.
//
// normalizeDecision is deliberately shape-agnostic: it scans every string in
// the payload at any depth. n8n's Slack sendAndWait customForm keys its output
// by the form field LABEL, which differs across n8n versions and would silently
// break a key-path lookup. Scanning removes that dependency entirely.
//
// Two separate budgets, by design:
//   attempt     the human review loop, max 3, then needs_manual
//   copy_retry  the machine copy-validation retry, max 1, then needs_manual
// A banned word must never consume one of the reviewer's three attempts.
// Pure: no n8n globals, no requires.
// ============================================================================

function collectStrings(obj, out, depth) {
  out = out || []; depth = depth || 0;
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'boolean' || typeof obj === 'number') return out;
  if (Array.isArray(obj)) { obj.forEach((v) => collectStrings(v, out, depth + 1)); return out; }
  if (typeof obj === 'object') {
    Object.keys(obj).forEach((k) => { out.push(k); collectStrings(obj[k], out, depth + 1); });
  }
  return out;
}

function normalizeDecision(payload) {
  if (!payload) return 'unknown';
  if (payload.timeout === true) return 'timeout';

  const hay = collectStrings(payload).join(' | ').toLowerCase();

  // order matters: "both" before "copy"/"image", since the label contains neither alone
  if (/regenerate both|regen both|\bboth\b/.test(hay)) return 'both';
  if (/regenerate copy|regen copy|new copy|rewrite/.test(hay)) return 'copy';
  if (/regenerate image|regen image|new image/.test(hay)) return 'image';
  if (/\bapprove\b|\bapproved\b|\bpublish\b/.test(hay)) {
    // guard against the literal false value of n8n's approval shape
    if (payload.data && payload.data.approved === false) return 'timeout';
    return 'approve';
  }
  if (payload.data && payload.data.approved === true) return 'approve';
  if (payload.data && payload.data.approved === false) return 'timeout';
  return 'unknown';
}

function extractReason(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const src = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const key = Object.keys(src).find((k) => /reason|note|comment|why|feedback/i.test(k));
  return key ? String(src[key] || '').trim() : '';
}

function loopGuard(state, cfg) {
  const s = state || {};
  const c = cfg || {};
  const maxAttempts = Number(c.maxAttempts || 3);
  const maxCopyRetries = Number(c.maxCopyRetries || 1);
  const decision = String(s.decision || 'unknown');
  const attempt = Number(s.attempt || 1);
  const copyRetry = Number(s.copy_retry || 0);
  const reason = String(s.reason || '').trim();
  const rowId = String(s.row_id || '');

  if (decision === 'approve') {
    return { action: 'publish', attempt, copy_retry: copyRetry, status: 'posted', message: '', revision_note: '' };
  }
  if (decision === 'timeout') {
    return {
      action: 'expired', attempt, copy_retry: copyRetry, status: 'expired',
      message: 'Review timed out with no response. Nothing was posted. Row id ' + rowId + '.',
      revision_note: '',
    };
  }

  // machine retry after failed copy validation — its own budget
  if (decision === 'copy_invalid') {
    if (copyRetry >= maxCopyRetries) {
      return {
        action: 'needs_manual', attempt, copy_retry: copyRetry, status: 'needs_manual',
        message: 'Copy validation failed twice, needs a human. Row id ' + rowId + '. Last reason: ' + reason,
        revision_note: reason,
      };
    }
    return { action: 'reinvoke', attempt, copy_retry: copyRetry + 1, status: 'in_review', message: '', revision_note: reason };
  }

  // human rejection — copy, image, both, or an unrecognised response
  if (attempt > maxAttempts) {
    return {
      action: 'needs_manual', attempt, copy_retry: 0, status: 'needs_manual',
      message: maxAttempts + ' attempts rejected, needs a human. Row id ' + rowId + '.',
      revision_note: reason,
    };
  }
  return { action: 'reinvoke', attempt: attempt + 1, copy_retry: 0, status: 'in_review', message: '', revision_note: reason };
}

if (typeof module !== 'undefined') module.exports = { normalizeDecision, extractReason, loopGuard, collectStrings };
