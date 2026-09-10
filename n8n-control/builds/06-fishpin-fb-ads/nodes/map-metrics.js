// Glue: fold the two Graph responses into the four sheet columns.
const row = $('Split Posts').first().json.row;
const insights = $('Get Insights').first().json;
const engagement = $json;

const m = mapMetrics(insights, engagement);
return [{ json: Object.assign({ id: row.id, _rowNumber: row._rowNumber, status: 'measured' }, m) }];
