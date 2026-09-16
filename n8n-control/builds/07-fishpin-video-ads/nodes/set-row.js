// Glue: Append Row created this run's row at status generating. Every later
// write targets the row number the append reports.
const cfg = $('Config').first().json;
const run = $('Start Run').first().json;
const rowNumber = rowNumberFromAppend($json);
if (!rowNumber) {
  return [{ json: { ok: false, status: 'failed', message: 'FishPin video run stopped before any spend: could not create the '
    + cfg.videosTab + ' row. ' + JSON.stringify($json.error || $json).slice(0, 300) } }];
}
return [{ json: Object.assign({}, run, { ok: true, row_number: rowNumber }) }];
