// Glue: HTTP nodes drop the incoming binary, so put the MP4 back on the item
// for Slack Push Bytes. Also the gate for Slack refusing the upload.
const run = $('Set Row').first().json;
const rendered = $('Check Render').first();
if (!$json.ok || !$json.upload_url || !$json.file_id) {
  return [{ json: { ok: false, status: 'failed', message: 'FishPin video ' + run.id + ': Slack would not accept the video upload ('
    + ($json.error || JSON.stringify($json).slice(0, 200)) + '). The video was rendered but not delivered.' } }];
}
return [{ json: { ok: true, upload_url: $json.upload_url, file_id: $json.file_id }, binary: { video: rendered.binary.video } }];
