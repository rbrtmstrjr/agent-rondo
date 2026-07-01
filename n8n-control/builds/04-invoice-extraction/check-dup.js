// ============================================================================
// Check Dup — Code node (no creds). Reads the Airtable dedup lookup result; if a
// matching record already exists, marks this one as a duplicate (to be rejected).
// ============================================================================

const dq = $json; // dedup query (Airtable list) response
const mv = $('Map & Validate').first().json;

const records = (dq && Array.isArray(dq.records)) ? dq.records : [];
const duplicate = records.length > 0;

const out = Object.assign({}, mv, {
  duplicate,
  dupRecordId: duplicate ? records[0].id : '',
});

if (duplicate) {
  out.message = '🔁 Duplicate — this invoice is already logged ('
    + (mv.vendor || 'vendor') + (mv.invoiceNumber ? ' #' + mv.invoiceNumber : '') + '). Skipped.';
  out.status = 'Duplicate';
}

return [{ json: out }];
