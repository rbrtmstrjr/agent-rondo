// ============================================================================
// Videos tab rules. Pure. A row is created once by append and then updated in
// place by exact cell (never re-appended), the build-06 lesson.
// ============================================================================
const VIDEO_HEADERS = ['id', 'created_at', 'topic_input', 'pillar', 'topic', 'hook', 'voiceover',
  'status', 'video_url', 'est_cost_usd'];
const IMAGE_USD = 0.04;
const VEO_USD_PER_SECOND = 0.08;
const TEXT_USD = 0.01;

const columnLetter = (index) => String.fromCharCode(65 + Number(index));

function parseValues(values) {
  const v = Array.isArray(values) ? values : [];
  const headers = v[0] || [];
  return v.slice(1).map((r, i) => {
    const o = { _rowNumber: i + 2 };
    headers.forEach((h, j) => { o[h] = (r && r[j] !== undefined) ? r[j] : ''; });
    return o;
  });
}

function collectPriorVideos(rows, limit) {
  const max = limit == null ? 15 : limit;
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => String(r.status || '').trim().toLowerCase() === 'delivered')
    .map((r) => ({ hook: String(r.hook || ''), voiceover: String(r.voiceover || ''), topic: String(r.topic || '') }))
    .slice(-max);
}

const pad2 = (n) => String(n).padStart(2, '0');
function newVideoId(date) {
  const d = date || new Date();
  return 'VID-' + d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
    + '-' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds());
}

function buildNewRow(ctx) {
  const c = ctx || {};
  const row = VIDEO_HEADERS.map(() => '');
  row[0] = String(c.id || '');
  row[1] = String(c.createdAt || '');
  row[2] = String(c.topicInput || '');
  row[7] = 'generating';
  return row;
}

function rowNumberFromAppend(resp) {
  const range = String((resp && resp.updates && resp.updates.updatedRange) || '');
  const m = range.match(/![A-Z]+(\d+)(?::[A-Z]+\d+)?$/);
  return m ? Number(m[1]) : null;
}

function statusUpdate(tab, rowNumber, fields) {
  const f = fields || {};
  const data = [];
  VIDEO_HEADERS.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(f, h)) {
      data.push({ range: tab + '!' + columnLetter(i) + rowNumber, values: [[f[h] == null ? '' : f[h]]] });
    }
  });
  return { valueInputOption: 'RAW', data };
}

function estCost(ctx) {
  const c = ctx || {};
  const usd = (c.veoUsed ? Number(c.veoSeconds || 0) * VEO_USD_PER_SECOND : 0)
    + Number(c.images || 0) * IMAGE_USD + TEXT_USD;
  return Math.round(usd * 100) / 100;
}

if (typeof module !== 'undefined') {
  module.exports = {
    VIDEO_HEADERS, columnLetter, parseValues, collectPriorVideos, newVideoId, buildNewRow,
    rowNumberFromAppend, statusUpdate, estCost,
  };
}
