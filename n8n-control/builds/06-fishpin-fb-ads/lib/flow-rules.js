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

// Values only (no keys) — feeds the decisive exact-match pass. A reviewer's
// free-text reason is prose, not a dropdown selection, so it will almost
// never equality-match a canonical decision string even though it may
// contain the words "copy"/"image"/"both"/"approve" in an ordinary sentence.
function collectValues(obj, out, depth) {
  out = out || []; depth = depth || 0;
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'boolean' || typeof obj === 'number') return out;
  if (Array.isArray(obj)) { obj.forEach((v) => collectValues(v, out, depth + 1)); return out; }
  if (typeof obj === 'object') {
    Object.keys(obj).forEach((k) => collectValues(obj[k], out, depth + 1));
  }
  return out;
}

// Same as collectStrings, but does not descend into (or push the values of)
// any key that looks like a free-text reason/note/comment field. Keys
// themselves are still pushed — the n8n {data:{approved:true}} shape depends
// on the literal key "approved" being visible to the fuzzy scan.
function collectFuzzyHaystack(obj, out, depth) {
  out = out || []; depth = depth || 0;
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (typeof obj === 'boolean' || typeof obj === 'number') return out;
  if (Array.isArray(obj)) { obj.forEach((v) => collectFuzzyHaystack(v, out, depth + 1)); return out; }
  if (typeof obj === 'object') {
    Object.keys(obj).forEach((k) => {
      out.push(k);
      if (/reason|note|comment|why|feedback/i.test(k)) return; // exclude prose from the fuzzy scan
      collectFuzzyHaystack(obj[k], out, depth + 1);
    });
  }
  return out;
}

function normalizeValue(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Canonical dropdown strings -> decision. Exact-match only: this is what
// makes pass 1 decisive rather than fuzzy.
const EXACT_DECISIONS = {
  approve: 'approve',
  'regenerate copy': 'copy',
  'regenerate image': 'image',
  'regenerate both': 'both',
};

function normalizeDecision(payload) {
  if (!payload) return 'unknown';
  if (payload.timeout === true) return 'timeout';

  // Pass 1 (decisive): an exact-match VALUE beats any amount of surrounding
  // prose. This still works when the field is named field_0 or anything
  // else, because it matches on the VALUE, not the key — so it stays
  // shape-agnostic. Only fires when exactly one distinct decision is found;
  // ambiguous or absent exact matches fall through to the fuzzy scan.
  const exactMatches = new Set();
  collectValues(payload).forEach((v) => {
    const norm = normalizeValue(v);
    if (Object.prototype.hasOwnProperty.call(EXACT_DECISIONS, norm)) {
      exactMatches.add(EXACT_DECISIONS[norm]);
    }
  });
  if (exactMatches.size === 1) {
    const only = exactMatches.values().next().value;
    if (only === 'approve' && payload.data && payload.data.approved === false) return 'timeout';
    return only;
  }

  // Pass 2 (fallback fuzzy scan): only reached when pass 1 found nothing
  // decisive. Excludes reason/note/comment-keyed prose from the haystack so
  // a rejection's free-text explanation can't be mistaken for the decision.
  const hay = collectFuzzyHaystack(payload).join(' | ').toLowerCase();

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

// Walks the payload at any depth (same bounded-depth traversal as
// collectStrings) and returns the first non-empty string value whose key
// looks like a free-text reason/note/comment field. Checks every key at the
// current level before descending, so a reason at a shallower level wins
// over one further down.
function findReason(obj, depth) {
  depth = depth || 0;
  if (obj == null || depth > 6 || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = findReason(obj[i], depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    if (/reason|note|comment|why|feedback/i.test(k) && typeof v === 'string' && v.trim() !== '') {
      return v.trim();
    }
  }
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v && typeof v === 'object') {
      const found = findReason(v, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function extractReason(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return findReason(payload, 0) || '';
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
        message: 'Copy validation failed ' + (maxCopyRetries + 1) + ' times, needs a human. Row id ' + rowId + '. Last reason: ' + reason,
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
