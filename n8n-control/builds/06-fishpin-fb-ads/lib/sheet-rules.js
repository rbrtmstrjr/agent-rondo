// ============================================================================
// Google Sheet row selection and shaping, plus Graph metric mapping.
// Pure: no n8n globals, no requires.
// ============================================================================

const QUEUE_HEADERS = [
  'id', 'pillar', 'topic', 'key_message', 'cta', 'notes', 'status', 'scheduled_for',
  'caption', 'image_url', 'fb_post_id', 'posted_at', 'likes', 'comments', 'shares', 'reach',
];

const ATTEMPT_HEADERS = [
  'ts', 'row_id', 'attempt', 'pillar', 'headline', 'caption', 'image_url', 'decision', 'revision_note',
];

// Only 'ready' enters rotation. Everything else is either mid-flight (in_review)
// or terminal, and only a human returning a row to 'ready' puts it back.
function selectRow(rows, rowId) {
  const list = Array.isArray(rows) ? rows : [];
  if (rowId) return list.find((r) => String(r.id) === String(rowId)) || null;
  return list.find((r) => String(r.status || '').trim().toLowerCase() === 'ready') || null;
}

function selectDueRows(rows, nowMs, delayHours) {
  const list = Array.isArray(rows) ? rows : [];
  const cutoff = Number(nowMs) - Number(delayHours || 24) * 3600 * 1000;
  return list.filter((r) => {
    if (String(r.status || '').toLowerCase() !== 'posted') return false;
    if (String(r.reach || '').trim() !== '') return false;
    if (!r.fb_post_id && r.fb_post_id !== 0 && !r.posted_at) return false;
    const t = Date.parse(String(r.posted_at || ''));
    if (isNaN(t)) return false;
    return t <= cutoff;
  });
}

function buildAttemptRow(ctx) {
  const c = ctx || {};
  return {
    ts: new Date().toISOString(),
    row_id: String(c.row_id || ''),
    attempt: Number(c.attempt || 1),
    pillar: String(c.pillar || ''),
    headline: String(c.headline || ''),
    caption: String(c.caption || ''),
    image_url: String(c.image_url || ''),
    decision: String(c.decision || ''),
    revision_note: String(c.revision_note || ''),
  };
}

function buildQueueUpdate(ctx) {
  const c = ctx || {};
  const status = String(c.status || '');
  return {
    id: String(c.id || ''),
    status,
    caption: String(c.caption || ''),
    image_url: String(c.image_url || ''),
    fb_post_id: String(c.fb_post_id || ''),
    posted_at: status === 'posted' ? new Date().toISOString() : '',
  };
}

function mapMetrics(insights, engagement) {
  const data = (insights && Array.isArray(insights.data)) ? insights.data : [];
  const pick = (name) => {
    const row = data.find((d) => d.name === name);
    if (!row || !Array.isArray(row.values) || !row.values.length) return null;
    return row.values[0].value;
  };

  const reach = Number(pick('post_impressions')) || 0;

  let likes = 0;
  const e = engagement || {};
  if (e.reactions && e.reactions.summary && typeof e.reactions.summary.total_count === 'number') {
    likes = e.reactions.summary.total_count;
  } else {
    const byType = pick('post_reactions_by_type_total');
    if (byType && typeof byType === 'object') {
      likes = Object.keys(byType).reduce((a, k) => a + (Number(byType[k]) || 0), 0);
    }
  }

  const comments = (e.comments && e.comments.summary && Number(e.comments.summary.total_count)) || 0;
  const shares = (e.shares && Number(e.shares.count)) || 0;

  return { reach, likes, comments, shares };
}

if (typeof module !== 'undefined') {
  module.exports = { QUEUE_HEADERS, ATTEMPT_HEADERS, selectRow, selectDueRows, buildAttemptRow, buildQueueUpdate, mapMetrics };
}
