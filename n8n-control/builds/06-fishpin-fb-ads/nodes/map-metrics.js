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
// Get Insights carries onError continueRegularOutput, so a Graph API
// failure on one item can plausibly leave its output array shorter than
// Split Posts'/items' length — index i can run past the end of either
// array. The two missing-data cases have different consequences and are
// handled differently:
//   - missing insights: recoverable. mapMetrics({}, {}) returns all four
//     metrics as finite zeros (verified in Task 5), so the row is still
//     written as measured, just with zeros, instead of crashing the whole
//     run and leaving every due row unmeasured.
//   - missing split row: NOT recoverable — there is no row id and no
//     _rowNumber to write. Emitting the item anyway would send Update Row
//     a range like "Queue!Gundefined", the same silent-corruption class
//     already fixed in the main workflow's Publish path. Skip it entirely.
return items
  .map((it, i) => {
    const row = split[i] ? split[i].json.row : null;
    if (!row) return null;
    const insJson = insightsAll[i] ? insightsAll[i].json : {};
    const m = mapMetrics(insJson, it.json);
    return { json: Object.assign({ id: row.id, _rowNumber: row._rowNumber, status: 'measured' }, m) };
  })
  .filter(Boolean);
