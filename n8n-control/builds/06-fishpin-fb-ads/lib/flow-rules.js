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

// Canonical decision strings -> decision. Exact-match only: this is what
// makes pass 1 decisive rather than fuzzy.
//
// The Slack gate itself now emits only {data:{approved:bool}} (two native
// buttons), so in production only the `approve` row and the approved-key path
// below are exercised. The four string forms are kept because the internal
// 'copy' and 'image' decisions are still real: 'image' is what Pick Row's
// keep_copy branch tests for, 'copy_invalid' shares loopGuard's rejection
// path, and a decision can still arrive as a string through the re-invoke
// payload. Keeping them costs nothing and keeps normalizeDecision usable for
// any future gate that offers more than two buttons.
const EXACT_DECISIONS = {
  approve: 'approve',
  'regenerate copy': 'copy',
  'regenerate image': 'image',
  'regenerate both': 'both',
};

// The fixed steer handed to the regeneration when a reviewer declines. The
// two-button gate has no free-text field, so extractReason returns '' on every
// decline; without this the next attempt would be generated with an EMPTY
// revision_note, i.e. the model would be told to try again with no idea why,
// and would very likely produce the same thing.
const DECLINE_NOTE = 'The reviewer rejected this draft in Slack without giving a reason. '
  + 'Take a completely different angle: a different hook, a different one of the reader\'s problems '
  + 'to lead with, and a different scene for the images. Do not reuse the previous headline, the '
  + 'previous opening line, or the previous image concept.';

// Finds a boolean `approved` anywhere in the payload (bounded depth), which is
// the shape n8n's sendAndWait emits in `approvalType: 'double'` mode:
// {data: {approved: true|false}}. Returns true, false, or null when absent.
// null is what tells a 6-hour timeout apart from a Disapprove click -- see
// routeApproval.
function findApproved(obj, depth) {
  depth = depth || 0;
  if (obj == null || depth > 6 || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const f = findApproved(obj[i], depth + 1);
      if (f !== null) return f;
    }
    return null;
  }
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    if (/^approved$/i.test(keys[i]) && typeof obj[keys[i]] === 'boolean') return obj[keys[i]];
  }
  for (let i = 0; i < keys.length; i++) {
    const v = obj[keys[i]];
    if (v && typeof v === 'object') {
      const f = findApproved(v, depth + 1);
      if (f !== null) return f;
    }
  }
  return null;
}

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
    // A literal approved:false alongside the word "Approve" is a DECLINE, not
    // an approval and not a timeout (it used to be read as 'timeout', which
    // would have expired the row instead of regenerating it).
    if (only === 'approve' && payload.data && payload.data.approved === false) return 'both';
    return only;
  }

  // Pass 1b (the live path): n8n's native two-button approval. `approved` is
  // the whole decision.
  //   true  -> approve and publish
  //   false -> the reviewer clicked Decline, which means regenerate the copy
  //            AND the images for the same queue row, so 'both'.
  const approvedFlag = findApproved(payload, 0);
  if (approvedFlag === true) return 'approve';
  if (approvedFlag === false) return 'both';

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
    if (payload.data && payload.data.approved === false) return 'both';
    return 'approve';
  }
  return 'unknown';
}

// The Slack review gate specifically. Use this, not normalizeDecision, on the
// output of the `Slack Review` sendAndWait node.
//
// That node has exactly two possible outputs:
//   1. a button click, which resumes it through its own webhook and replaces
//      its output with {data: {approved: true|false}};
//   2. a `limitWaitTime` expiry, which resumes the execution WITHOUT the
//      webhook ever firing, so the node's output is still the input items it
//      returned when it put the execution to wait -- a passthrough carrying no
//      `approved` key at all.
//
// So "an `approved` boolean is present" means a human clicked, and its value
// says which button; "no `approved` boolean anywhere" means nobody clicked.
// That distinction matters because the two outcomes must not be treated alike:
// a decline consumes a human attempt and regenerates, a timeout consumes
// nothing and expires the row.
//
// Anything else unrecognisable is also treated as a timeout rather than as a
// rejection, deliberately: 'expired' posts to Slack and stops without
// publishing and without burning an attempt, which is the safe reading of "no
// decision was recorded". normalizeDecision keeps returning 'unknown' for that
// case, so the distinction stays visible to anything else that wants it.
function routeApproval(payload) {
  const d = normalizeDecision(payload);
  return d === 'unknown' ? 'timeout' : d;
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

  // human rejection — copy, image, both, or an unrecognised response.
  //
  // `attempt` is the attempt the reviewer just rejected, and it starts at 1.
  // So attempt === maxAttempts means the budget is already spent: re-invoking
  // there would produce a FOURTH review labelled "attempt 4 of 3", and the
  // escalation message would then claim "3 attempts rejected" after four.
  // `>=` is what makes 3 human reviews mean three.
  //
  // The Slack gate is two buttons with no free-text field, so `reason` is ''
  // on every real decline. An empty revision_note reaches brand.js as no
  // revision block at all, which means the regeneration is given no steer and
  // is free to hand the reviewer the same draft again. Fall back to the fixed
  // instruction; a typed reason (still possible from the copy-retry path or a
  // future gate) always wins.
  const note = reason || DECLINE_NOTE;
  if (attempt >= maxAttempts) {
    return {
      action: 'needs_manual', attempt, copy_retry: 0, status: 'needs_manual',
      message: maxAttempts + ' attempts rejected, needs a human. Row id ' + rowId + '.',
      revision_note: note,
    };
  }
  return { action: 'reinvoke', attempt: attempt + 1, copy_retry: 0, status: 'in_review', message: '', revision_note: note };
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeDecision, routeApproval, extractReason, loopGuard, collectStrings,
    findApproved, DECLINE_NOTE,
  };
}
