// Glue: fold the two Graph responses into the four sheet columns.
// Map Metrics runs once for ALL items (one per due row). Calling .first()
// on another node's accessor always returns index 0 of that node's output
// regardless of which item is being processed — it bypasses pairedItem
// matching entirely — so reading Split Posts/Get Insights that way here
// would collapse every due row onto the first one. Every node in this
// chain (Split Posts -> Get Insights -> Get Engagement -> Map Metrics) is
// 1:1 per item and preserves order, so index-aligning against `items`
// (Map Metrics' own input, i.e. Get Engagement's output) is deterministic
// and does not depend on pairedItem propagation through the HTTP nodes.
const split = $('Split Posts').all();
const insightsAll = $('Get Insights').all();
return items.map((it, i) => {
  const row = split[i].json.row;
  const m = mapMetrics(insightsAll[i].json, it.json);
  return { json: Object.assign({ id: row.id, _rowNumber: row._rowNumber, status: 'measured' }, m) };
});
