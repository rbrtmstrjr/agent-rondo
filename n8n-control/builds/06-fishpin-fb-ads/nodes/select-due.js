// Glue: which posted rows are old enough to have real numbers and have none yet.
const cfg = $('Config').first().json;
const vals = ($json.values || []);
const headers = vals[0] || [];
const rows = vals.slice(1).map((r, i) => {
  const o = { _rowNumber: i + 2 };
  headers.forEach((h, j) => { o[h] = r[j] === undefined ? '' : r[j]; });
  return o;
});

const due = selectDueRows(rows, Date.now(), Number(cfg.insightsDelayHours || 24));
if (!due.length) return [{ json: { any: false, count: 0, due: [] } }];
return due.map((r) => ({ json: { any: true, count: due.length, row: r } }));
