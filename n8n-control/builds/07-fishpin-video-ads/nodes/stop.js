// Glue: the single failure sink. Every stage that cannot continue emits
// { status, message }. This records the terminal status on the row when one
// exists, and Notify Stopped reports the message to Slack.
const cfg = $('Config').first().json;
const row = $('Set Row').isExecuted ? $('Set Row').first().json : null;
const status = String($json.status || 'failed');
const message = String($json.message || 'The FishPin video run stopped without a reason. Check the n8n execution.');
const hasRow = !!(row && row.ok && row.row_number);
return [{ json: { status, message, has_row: hasRow, sheet_body: hasRow ? statusUpdate(cfg.videosTab, row.row_number, { status }) : null } }];
