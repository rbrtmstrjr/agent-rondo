// Assembles fishpin-fb-ads.workflow.json.
// Libs are inlined ahead of each glue file. Each lib's own `module.exports =`
// line is guarded by `typeof module !== 'undefined'`, which is false in the
// n8n Code sandbox, so the export itself is already inert there — but the
// `lib()` helper below still neutralizes it (`module.exports =` -> `void `)
// rather than relying on that guard alone. `void {...}` is a valid no-op
// expression statement under either of this repo's two guard styles
// (single-line or block), survives a multi-line export object without
// leaving a dangling fragment, and never leaves the literal substring
// `module.exports` in a Code node body for the sandbox-safety assertion to
// (correctly) flag.
// Run: node build.js
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const lib = (n) => read(path.join('lib', n)).replace(/module\.exports\s*=/g, 'void ');
const glue = (n) => read(path.join('nodes', n));
const code = (libs, g, prelude) => (prelude ? prelude + '\n\n' : '')
  + libs.map(lib).join('\n\n') + '\n\n' + glue(g);

// CHANGE 3: the real FishPin logo, base64'd into the Build Image Prompt Code
// node at build time so it can be sent to Gemini as an inline reference image
// alongside the text prompt (the request shape proven in
// builds/brand-photoshoot-variations). ~7.5 KB of PNG, ~10 KB of base64 —
// small enough to inline, and inlining keeps the workflow JSON self-contained
// with no runtime fetch and no extra credential.
const LOGO_B64 = fs.readFileSync(path.join(__dirname, 'assets', 'logo.png')).toString('base64');
const LOGO_PRELUDE = '// The FishPin logo (assets/logo.png), base64, injected by build.js.\n'
  + 'const FISHPIN_LOGO_B64 = ' + JSON.stringify(LOGO_B64) + ';';

const GEMINI = { id: 'S0qfsjLzQfKC04iG', name: 'Gemini - Brand Variations' };
const SHEETS = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
// Created by the owner after the Meta setup; see README section "Facebook token".
const FB = { id: 'HFWwLB58m3JWzduP', name: 'FB Page - FishPin' };

const ERROR_WF = '660Xkpo164VSNTDZ';
const WEBHOOK_PATH = 'fishpin-ad';

// Loop-webhook shared secret. NEVER hardcode it here: this repo pushes to a
// GitHub remote, and the built workflow JSON is committed alongside it.
// Sourced ONLY from the FISHPIN_LOOP_SECRET environment variable, so a plain
// `node build.js` always emits the placeholder that Pick Row refuses.
// Deploy with:  FISHPIN_LOOP_SECRET=<value> node build.js
// The value lives in n8n-control/.env, which is git-ignored.
const LOOP_SECRET = process.env.FISHPIN_LOOP_SECRET || 'FILL_IN_LOOP_SECRET';
const SHEET_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const pos = (x, y) => [x, y];
const codeNode = (id, name, jsCode, x, y = 300) => ({
  parameters: { jsCode }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, y),
});
const ifNode = (id, name, leftValue, x, y) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'c', leftValue, rightValue: true,
      operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(x, y),
});
const http = (id, name, params, x, y, cred, tries = 3) => ({
  parameters: Object.assign({ authentication: 'predefinedCredentialType' }, params),
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: tries, waitBetweenTries: 2000, onError: 'continueRegularOutput',
  credentials: cred,
});
const slack = (id, name, params, x, y) => ({
  parameters: Object.assign({ select: 'channel' }, params),
  id, name, type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(x, y),
  onError: 'continueRegularOutput', credentials: { slackApi: SLACK },
});
const slackMsg = (id, name, channelExpr, text, x, y) => slack(id, name, {
  channelId: { __rl: true, value: channelExpr, mode: 'id' }, text, otherOptions: {},
}, x, y);

const cfgVal = (k) => "={{ $('Config').first().json." + k + ' }}';
const sheetUrl = (suffix) => "={{ '" + SHEET_BASE + "/' + $('Config').first().json.sheetId + '" + suffix + "' }}";

// Everything about this pipeline is stated in Philippine local time — the
// daily 09:00 posting slot, `posted_at`, the 24h insights cutoff, and the
// README. n8n resolves a cron expression against the workflow's timezone,
// which falls back to the INSTANCE timezone (UTC on a default VPS install)
// when the workflow does not set one — so an unset timezone fires the "09:00"
// slot at 17:00 Manila. Set in both places: settings.timezone is what n8n
// actually honours, and the node-level value keeps the intent visible on the
// node itself and pins it if the workflow is ever copied into another file.
const TZ = 'Asia/Manila';

const nodes = [
  // One post a day, every day, at 09:00 Manila (owner decision, 2026-09-15).
  { parameters: { rule: { interval: [
      { field: 'cronExpression', expression: '0 9 * * *' },
    ] }, timezone: TZ },
    id: 'n-sched', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(-620, 200) },
  { parameters: {}, id: 'n-man', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(-620, 360) },
  // onReceived: the caller (Re-invoke, the only caller) never reads the
  // response body, and the re-invoked run can sit in a sendAndWait for up to
  // reviewTimeoutHours. lastNode would hold the HTTP connection open for that
  // whole duration; Re-invoke's own retryOnFail (3 tries) would then treat a
  // timed-out connection as a failure and fire off additional full
  // executions — multiple Slack review prompts and potentially multiple
  // published posts for one queue row. onReceived acknowledges immediately,
  // so a retry only ever fires on a genuinely dropped request.
  { parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'onReceived', options: {} },
    id: 'n-wh', name: 'Loop Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(-620, 520), webhookId: 'fishpin-ad-hook' },

  { parameters: { assignments: { assignments: [
      { id: 'c1', name: 'pageId', value: '1020295897824587', type: 'string' },
      { id: 'c2', name: 'graphVersion', value: 'v21.0', type: 'string' },
      { id: 'c3', name: 'sheetId', value: '1tdud2e5BKy7IQ7wpYy8Iavl_hOK8vUBrUs1oYj1Cp3E', type: 'string' },
      { id: 'c4', name: 'queueTab', value: 'Queue', type: 'string' },
      { id: 'c5', name: 'attemptsTab', value: 'Attempts', type: 'string' },
      { id: 'c6', name: 'copyModel', value: 'gemini-2.5-flash', type: 'string' },
      { id: 'c7', name: 'imageModel', value: 'gemini-2.5-flash-image', type: 'string' },
      { id: 'c8', name: 'copyTemperature', value: 0.8, type: 'number' },
      { id: 'c9', name: 'maxAttempts', value: 3, type: 'number' },
      { id: 'c10', name: 'maxCopyRetries', value: 1, type: 'number' },
      { id: 'c11', name: 'reviewTimeoutHours', value: 6, type: 'number' },
      { id: 'c12', name: 'reviewChannel', value: 'C0BDSV5RB5G', type: 'string' },
      { id: 'c13', name: 'opsChannel', value: 'C0BDSV5RB5G', type: 'string' },
      // Both links are required in EVERY generated caption (validateCopy rule
      // 10), and websiteUrl is also set under the brand lockup in the bottom
      // left of every image. They live here, not in lib/brand.js, so a url
      // change is a Config edit and the prompt, the validator and the image
      // lockup can never disagree about what the url is.
      { id: 'c14', name: 'websiteUrl', value: 'www.fishpin.app', type: 'string' },
      // CORRECTED 2026-09-11: the package id was 'app.fishpin', which is not
      // the app. The real listing is id=com.fishpin.app; the old value 404s.
      { id: 'c15', name: 'playStoreUrl', value: 'https://play.google.com/store/apps/details?id=com.fishpin.app', type: 'string' },
      { id: 'c16', name: 'selfWebhookUrl', value: 'https://n8n.srv1193790.hstgr.cloud/webhook/' + WEBHOOK_PATH, type: 'string' },
      // Shared secret for the loop webhook. POST /webhook/fishpin-ad is a
      // public, unauthenticated endpoint; Loop Guard puts this value in the
      // re-invoke payload and Pick Row refuses any webhook call without it.
      // Replace the placeholder at deploy time — Pick Row refuses every
      // webhook call while it is still FILL_IN_*.
      { id: 'c17', name: 'loopSecret', value: LOOP_SECRET, type: 'string' },
    ] }, options: {} },
    id: 'n-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-400, 360) },

  http('n-read', 'Load Queue Row', {
    method: 'GET', url: sheetUrl("/values/' + $('Config').first().json.queueTab + '!A1:P1000"),
    nodeCredentialType: 'googleApi', options: {},
  }, -180, 360, { googleApi: SHEETS }),
  codeNode('n-pick', 'Pick Row', code(['sheet-rules.js'], 'load-queue.js'), 40, 360),
  ifNode('n-empty', 'Queue Empty?', '={{ !$json.found }}', 260, 360),
  // Pick Row can decline for several different reasons — an empty queue, an
  // unknown row id, a rejected loop secret, a row whose status makes it
  // ineligible for re-entry. It puts the specific one in `reason`; printing a
  // hardcoded "queue is empty" here would have hidden every security refusal
  // behind a message saying nothing was wrong.
  slackMsg('n-empty-msg', 'Notify Queue Empty', cfgVal('opsChannel'),
    '=:inbox_tray: FishPin ad run stopped before generating anything. Nothing was posted.\nReason: {{ $json.reason }}', 480, 200),

  // Targeted single-cell write to column G (status) of THIS row. Appending here
  // would add a second row with the same id, leaving the original still 'ready'
  // for the next scheduled run to pick up again.
  http('n-claim', 'Claim Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [{ range: $('Config').first().json.queueTab + '!G' + $('Pick Row').first().json.row._rowNumber, values: [['in_review']] }] }) }}",
    options: {},
  }, 480, 420, { googleApi: SHEETS }),

  // Spec §8: "Regenerate image — re-enter keeping the approved caption,
  // appending revision_note to the image prompt, SKIPPING copy generation."
  // Without this branch every re-entry regenerated the copy too, so a
  // reviewer complaining about a garbled image got a completely different ad,
  // and their image complaint was injected into the COPY prompt as "write a
  // different angle" — telling the model to abandon the headline they liked.
  ifNode('n-ifkeep', 'Keep Copy?', "={{ $('Pick Row').first().json.keep_copy }}", 620, 340),
  codeNode('n-reuse', 'Reuse Copy', code([], 'reuse-copy.js'), 860, 180),

  codeNode('n-cprompt', 'Build Copy Prompt', code(['brand.js'], 'build-copy-prompt.js'), 700, 420),
  http('n-copy', 'Generate Copy', {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.copyModel + ':generateContent' }}",
    nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
    options: { timeout: 60000 },
  }, 920, 420, { googlePalmApi: GEMINI }),
  codeNode('n-vcopy', 'Validate Copy', code(['brand.js', 'copy-rules.js'], 'validate-copy.js'), 1140, 420),
  ifNode('n-ifcopy', 'Copy Valid?', '={{ $json.valid }}', 1360, 420),

  // FAN-OUT. Emits one item per image_prompt (1 to 5), so Generate Image,
  // Validate Image, Upload Photo and Get Photo URL all run per image. Nothing
  // downstream may read this node with .first().
  codeNode('n-iprompt', 'Build Image Prompt',
    code(['image-rules.js'], 'build-image-prompt.js', LOGO_PRELUDE), 1580, 340),
  http('n-img', 'Generate Image', {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.imageModel + ':generateContent' }}",
    nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
    options: { timeout: 120000 },
  }, 1800, 340, { googlePalmApi: GEMINI }, 2),
  codeNode('n-vimg', 'Validate Image', code(['image-rules.js'], 'validate-image.js'), 2020, 340),
  ifNode('n-ifimg', 'Image Valid?', '={{ $json.valid }}', 2240, 340),
  // Two very different failures land here and the message must say which:
  //   - image GENERATION failed  (Validate Image rejected the bytes)
  //   - image URL lookup failed  (Get Photo URL returned nothing usable)
  // The second is the dangerous one: the upload succeeded, so a media_fbid
  // that would publish just fine still exists, and the reviewer would have
  // been asked to approve an ad they could not see.
  // $('Get Photo URL').isExecuted is what distinguishes them, and it is used
  // instead of reading that node unconditionally — naming an un-executed node
  // in an expression throws, and a throw here would blank this very alert.
  // The reasons for the URL stage come from Collect Photos, the single-item
  // join — Get Photo URL is a fan-out node now and must never be read with
  // .first(). Validate Image is still read that way deliberately: on the
  // FAILURE path it returns exactly one aggregated item by design.
  slackMsg('n-imgfail', 'Notify Image Failed', cfgVal('opsChannel'),
    "=:warning: FishPin ad FAILED for row {{ $('Pick Row').first().json.row.id }}. Nothing was posted; the row has been marked terminal."
    + "\nStage: {{ $('Get Photo URL').isExecuted ? 'image URL lookup — the images generated and uploaded fine, but at least one did not come back with a usable public image URL, so the reviewer could not have seen the whole set. The review gate was NOT opened and no partial album was published.' : 'image generation — the model returned no usable image for at least one of the images this post needs.' }}"
    + "\nReasons: {{ $('Get Photo URL').isExecuted ? ($('Collect Photos').isExecuted ? $('Collect Photos').first().json.reason : 'Get Photo URL returned nothing usable.') : $('Validate Image').first().json.reasons.join(' | ') }}",
    2460, 480),

  http('n-up', 'Upload Photo (unpublished)', {
    method: 'POST',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Config').first().json.pageId + '/photos' }}",
    nodeCredentialType: 'facebookGraphApi', sendBody: true, contentType: 'multipart-form-data',
    bodyParameters: { parameters: [
      { name: 'published', value: 'false' },
      { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' },
    ] }, options: {},
  }, 2460, 260, { facebookGraphApi: FB }),
  http('n-url', 'Get Photo URL', {
    method: 'GET',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $json.id + '?fields=images' }}",
    nodeCredentialType: 'facebookGraphApi', options: {},
  }, 2680, 260, { facebookGraphApi: FB }),

  // THE JOIN. Turns the per-image fan-out back into one album: attached_media
  // for the /feed publish, the urls for the Slack preview and the Attempts log,
  // and the shared copy. It also does the per-photo images[0].source check for
  // every photo and reduces it to one all-or-nothing `ok` flag, which is what
  // makes the gate below possible at all with more than one image.
  // copy-rules.js is inlined here for buildPostMessage: Collect Photos is the
  // single-item join BOTH Publish Post and Post Preview read from, so it is the
  // one place the published message can be composed once and shared.
  codeNode('n-collect', 'Collect Photos', code(['copy-rules.js'], 'collect-photos.js'), 2900, 260),

  // FAIL-CLOSED GATE. Get Photo URL carries onError continueRegularOutput, so
  // a failure there does not abort the run. The Post Preview message ends with
  // the image URLs; if that expression throws, Slack's API call fails and the
  // ENTIRE preview message is lost — no images, no headline, no caption. The
  // reviewer then sees only the bare "Review the FishPin ad above" prompt. The
  // media_fbids from the successful uploads are still valid, so clicking
  // Approve there publishes an ad to the public Page that no human ever saw.
  // The human gate has to be closed, not blind: no usable image URL means no
  // review at all.
  //
  // With 1 to 5 photos this gate must also be ALL-OR-NOTHING. A per-item test
  // of images[0].source would put the good photos on the true branch and the
  // bad ones on the false branch — and publish a partial album. Collect Photos
  // collapses the set to one item first, so one bad photo sinks the whole post.
  ifNode('n-ifurl', 'Image URL OK?', '={{ $json.ok }}', 3120, 260),

  codeNode('n-att', 'Log Attempt', code(['sheet-rules.js'], 'log-attempt.js'), 3340, 200),
  http('n-attw', 'Write Attempt', {
    method: 'POST', url: sheetUrl("/values/' + $('Config').first().json.attemptsTab + '!A:J:append"),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ values: [[ $json.ts, $json.row_id, $json.attempt, $json.pillar, $json.headline, $json.caption, $json.image_url, $json.decision, $json.revision_note, $json.aspect ]] }) }}',
    sendQuery: true, queryParameters: { parameters: [
      { name: 'valueInputOption', value: 'RAW' },
      { name: 'insertDataOption', value: 'INSERT_ROWS' },
    ] }, options: {},
  }, 3560, 200, { googleApi: SHEETS }),

  slack('n-prev', 'Post Preview', {
    channelId: { __rl: true, value: cfgVal('reviewChannel'), mode: 'id' },
    // Everything is read from Collect Photos, the single-item join: the copy
    // (on the "Regenerate image" branch Validate Copy never executes, see
    // reuse-copy.js, so naming it here would throw and blank the preview) and
    // every photo url. The urls are safe to read unconditionally — Image URL
    // OK? upstream guarantees all image_count of them exist on this branch.
    // Each url goes on its own line so Slack unfurls it into a visible image.
    // The body of the preview is the EXACT message Publish Post will send: one
    // field, composed once by Collect Photos' buildPostMessage call and never
    // re-assembled from caption/cta/hashtags here. Re-assembling it in two node
    // expressions is how the preview and the published post drifted apart.
    // Headline and subhead are shown separately because they are rendered into
    // image 1; they are not part of the post text.
    text: "=*FishPin ad ready for review* — `{{ $('Pick Row').first().json.row.id }}` · _{{ $('Pick Row').first().json.row.pillar }}_ · attempt {{ $('Pick Row').first().json.attempt }} of {{ $('Config').first().json.maxAttempts }}\n\n*Headline:* {{ $('Collect Photos').first().json.copy.headline }}\n*Subhead:* {{ $('Collect Photos').first().json.copy.subhead }}\n\n{{ $('Collect Photos').first().json.message }}\n\n*Images:* {{ $('Collect Photos').first().json.image_count }} in this post\n{{ $('Collect Photos').first().json.urls.join('\\n') }}",
    otherOptions: {},
  }, 3780, 200),

  // CHANGE 1: the decision is made in Slack, with two native buttons, exactly
  // as sv91rOvu8Bec8sLc does it — `approvalType: 'double'`. It used to be
  // responseType 'customForm', which sent the reviewer to a 4-option dropdown
  // in a separate browser tab. Approve publishes; Decline regenerates the copy
  // AND the images for the same queue row (routeApproval maps approved:false
  // to 'both'). There is no free-text field any more, so a decline's
  // revision_note falls back to flow-rules.js's DECLINE_NOTE.
  slack('n-rev', 'Slack Review', {
    operation: 'sendAndWait',
    channelId: { __rl: true, value: cfgVal('reviewChannel'), mode: 'id' },
    message: "=Review the FishPin ad above (`{{ $('Pick Row').first().json.row.id }}`, attempt {{ $('Pick Row').first().json.attempt }} of {{ $('Config').first().json.maxAttempts }}, {{ $('Collect Photos').first().json.image_count }} image(s)).\n\n*Approve* publishes it to the FishPin Page as one post.\n*Decline* throws it away and regenerates the copy and images for the same idea.",
    approvalOptions: { values: { approvalType: 'double' } },
    options: { limitWaitTime: true, resumeAmount: '={{ $(\'Config\').first().json.reviewTimeoutHours }}', resumeUnit: 'hours' },
  }, 3780, 320),

  codeNode('n-route', 'Route Decision', code(['flow-rules.js'], 'route-decision.js'), 4000, 260),
  ifNode('n-ifapp', 'Approved?', '={{ $json.approved }}', 4220, 260),

  http('n-pub', 'Publish Post', {
    method: 'POST',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Config').first().json.pageId + '/feed' }}",
    nodeCredentialType: 'facebookGraphApi', sendBody: true, contentType: 'form-urlencoded',
    // ONE post carrying every uploaded photo — the two-step
    // upload-unpublished-then-attach pattern from sv91rOvu8Bec8sLc.
    // attached_media is already a JSON array string built by Collect Photos
    // and carried through Route Decision; a single-image post is the same
    // body with one entry, which /feed accepts.
    bodyParameters: { parameters: [
      // The message is NOT assembled here. Collect Photos composed it once with
      // buildPostMessage (caption, blank line, cta, blank line, both links on
      // consecutive lines, blank line, hashtags) and Route Decision carried it
      // through, so what publishes is byte-for-byte what the reviewer approved in
      // the Slack preview. This expression used to build its own
      // caption + cta + hashtags string while the copy prompt ALSO asked the model
      // to end the caption with the cta and both links, which is why the first real
      // published post carried the call to action twice.
      { name: 'message', value: '={{ $json.message }}' },
      { name: 'attached_media', value: '={{ $json.attached_media }}' },
    ] }, options: {},
  }, 4440, 180, { facebookGraphApi: FB }),
  codeNode('n-wb', 'Write Back', code(['sheet-rules.js'], 'map-writeback.js'), 4660, 180),
  // A failed Publish Post has onError continueRegularOutput, so the run does
  // not abort — it falls through to Write Back with pub.error set. Without
  // this gate the failure would flow straight into Write Back Row's
  // targeted-range write with an undefined _rowNumber (a swallowed 400) and
  // Notify Success would report a post id that was never created.
  ifNode('n-ifpub', 'Published?', '={{ $json.ok }}', 4880, 180),
  // Two targeted ranges in one call: G = status, I:L = caption, image_url,
  // fb_post_id, posted_at. Column H (scheduled_for) is deliberately skipped so
  // the human's value is not blanked.
  http('n-wbw', 'Write Back Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [ { range: $('Config').first().json.queueTab + '!G' + $json._rowNumber, values: [[ $json.status ]] }, { range: $('Config').first().json.queueTab + '!I' + $json._rowNumber + ':L' + $json._rowNumber, values: [[ $json.caption, $json.image_url, $json.fb_post_id, $json.posted_at ]] } ] }) }}",
    options: {},
  }, 5100, 100, { googleApi: SHEETS }),
  // Write Back Row carries onError continueRegularOutput too, so a failed
  // Sheets write fell straight through to "✅ Posted" while the row still read
  // status=in_review with empty caption/fb_post_id/posted_at — which also
  // means the insights scanner (it selects on status=posted + a posted_at)
  // would never measure that post. Same class as Published? and Image URL OK?:
  // never report success on the strength of a call that may have failed.
  ifNode('n-ifwb', 'Row Written?', '={{ !$json.error && !!$json.spreadsheetId }}', 5320, 100),
  slackMsg('n-ok', 'Notify Success', cfgVal('opsChannel'),
    "=:white_check_mark: Posted to the FishPin Page — row `{{ $('Route Decision').first().json.row_id }}` ({{ $('Route Decision').first().json.pillar }})\nPost id: {{ $('Publish Post').first().json.id }}\n{{ $('Route Decision').first().json.image_url }}",
    5540, 40),
  // The post IS live — only the bookkeeping failed — so this message has to
  // hand over everything a human needs to repair the row by hand.
  slackMsg('n-wbfail', 'Notify Writeback Failed', cfgVal('opsChannel'),
    "=:warning: FishPin ad IS LIVE on the Page, but the Queue row could NOT be updated — row `{{ $('Route Decision').first().json.row_id }}`."
    + "\nPost id: {{ $('Publish Post').first().json.id }}"
    + "\nSheets error: {{ JSON.stringify(($json || {}).error || 'unknown') }}"
    + "\nThe row is marked needs_manual. Paste the post id, caption, image url and posted_at into the Queue row by hand, then set status=posted so the 24h insights scan picks it up."
    + "\nCaption: {{ $('Route Decision').first().json.copy.caption }}"
    + "\nImage: {{ $('Route Decision').first().json.image_url }}",
    5540, 160),

  // The captured error/row id come straight off Write Back's failure output,
  // which is still $json here (Published? just routes, it doesn't reshape).
  slackMsg('n-pubfail', 'Notify Publish Failed', cfgVal('opsChannel'),
    "=:x: FishPin ad FAILED to publish to the FB Page — row `{{ $json.id }}`.\nError: {{ $json.error }}\nThe row has been marked failed; it will not be retried automatically.",
    5100, 260),

  codeNode('n-guard', 'Loop Guard', code(['flow-rules.js'], 'loop-guard.js'), 4440, 400),
  ifNode('n-ifloop', 'Re-invoke?', '={{ $json.reinvoke }}', 4660, 400),
  http('n-re', 'Re-invoke', {
    method: 'POST', url: cfgVal('selfWebhookUrl'),
    authentication: 'none', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload) }}',
    options: {},
  }, 4880, 340, {}),
  // Re-invoke used to have no outgoing connection at all: its output was
  // consumed by nothing, and it carries onError continueRegularOutput, so if
  // all 3 POSTs failed the regeneration simply never happened — no Slack
  // message, no terminal status, the row stranded at in_review forever.
  // The webhook responds onReceived with a body and no error key; a failure
  // leaves { error: ... } instead.
  ifNode('n-ifre', 'Re-invoked?', '={{ !$json.error }}', 5100, 340),
  slackMsg('n-refail', 'Notify Re-invoke Failed', cfgVal('opsChannel'),
    "=:x: FishPin ad regeneration could NOT be started for row `{{ $('Loop Guard').first().json.row_id }}` — every attempt to call the loop webhook failed."
    + "\nError: {{ JSON.stringify(($json || {}).error || 'unknown') }}"
    + "\nNothing was posted and no new draft exists. The row is marked terminal; set its status back to ready to try again.",
    5320, 340),
  // Fed from five predecessors. Only one of them — Re-invoke? false — arrives
  // with Loop Guard's own json, which already carries .status ('expired' or
  // 'needs_manual'). The other four are Slack nodes, so by the time execution
  // reaches here $json is the Slack API response and carries no .status; the
  // fallback is what still gets those rows to a terminal status instead of
  // leaving them at in_review forever.
  //
  // The fallback distinguishes one case: if Write Back said the publish
  // SUCCEEDED and we still ended up here, the post is live and only the
  // bookkeeping failed, so the row needs a human to repair it (needs_manual),
  // not a 'failed' label that reads as "nothing was posted". Every other path
  // (image failure, publish failure, re-invoke failure) is a genuine 'failed'.
  http('n-term', 'Mark Terminal', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [{ range: $('Config').first().json.queueTab + '!G' + $('Pick Row').first().json.row._rowNumber, values: [[ $json.status || ($('Write Back').isExecuted && $('Write Back').first().json.ok ? 'needs_manual' : 'failed') ]] }] }) }}",
    options: {},
  }, 4880, 460, { googleApi: SHEETS }),
  slackMsg('n-stop', 'Notify Stopped', cfgVal('opsChannel'),
    '=:octagonal_sign: {{ $json.message }}', 5100, 460),
];

const c = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const cIf = (from, t, f) => ({ [from]: { main: [
  [{ node: t, type: 'main', index: 0 }], [{ node: f, type: 'main', index: 0 }]] } });
// An IF whose happy branch is the end of the road: only the false branch is
// wired, so the true branch terminates the execution normally.
const cIfFalseOnly = (from, f) => ({ [from]: { main: [
  [], [{ node: f, type: 'main', index: 0 }]] } });

const connections = Object.assign({},
  c('Schedule Trigger', 'Config'),
  c('Manual Trigger', 'Config'),
  c('Loop Webhook', 'Config'),
  c('Config', 'Load Queue Row'),
  c('Load Queue Row', 'Pick Row'),
  c('Pick Row', 'Queue Empty?'),
  cIf('Queue Empty?', 'Notify Queue Empty', 'Claim Row'),
  // Spec §8: a "Regenerate image" re-entry keeps the approved copy and skips
  // copy generation entirely, so Reuse Copy stands in for Validate Copy and
  // feeds Build Image Prompt directly.
  c('Claim Row', 'Keep Copy?'),
  cIf('Keep Copy?', 'Reuse Copy', 'Build Copy Prompt'),
  c('Reuse Copy', 'Build Image Prompt'),
  c('Build Copy Prompt', 'Generate Copy'),
  c('Generate Copy', 'Validate Copy'),
  c('Validate Copy', 'Copy Valid?'),
  cIf('Copy Valid?', 'Build Image Prompt', 'Loop Guard'),
  c('Build Image Prompt', 'Generate Image'),
  c('Generate Image', 'Validate Image'),
  c('Validate Image', 'Image Valid?'),
  cIf('Image Valid?', 'Upload Photo (unpublished)', 'Notify Image Failed'),
  // Without this the row was already flipped to in_review by Claim Row and
  // would never reach a terminal status on an image-generation failure.
  c('Notify Image Failed', 'Mark Terminal'),
  c('Upload Photo (unpublished)', 'Get Photo URL'),
  // FAIL-CLOSED: without a usable image URL for EVERY photo, the Post Preview
  // message throws and is never delivered, leaving the reviewer approving an ad
  // they cannot see while perfectly valid media_fbids stand ready to publish
  // it. Collect Photos joins the per-image fan-out back into one item and
  // reduces "are all N photos usable?" to a single flag, so the gate is
  // all-or-nothing and a partial album can never be published.
  c('Get Photo URL', 'Collect Photos'),
  c('Collect Photos', 'Image URL OK?'),
  cIf('Image URL OK?', 'Log Attempt', 'Notify Image Failed'),
  c('Log Attempt', 'Write Attempt'),
  c('Write Attempt', 'Post Preview'),
  c('Post Preview', 'Slack Review'),
  c('Slack Review', 'Route Decision'),
  c('Route Decision', 'Approved?'),
  cIf('Approved?', 'Publish Post', 'Loop Guard'),
  c('Publish Post', 'Write Back'),
  c('Write Back', 'Published?'),
  cIf('Published?', 'Write Back Row', 'Notify Publish Failed'),
  // A failed Sheets write must not be reported as "✅ Posted".
  c('Write Back Row', 'Row Written?'),
  cIf('Row Written?', 'Notify Success', 'Notify Writeback Failed'),
  c('Notify Writeback Failed', 'Mark Terminal'),
  // Marks the row terminal so a failed publish is not stranded at in_review.
  c('Notify Publish Failed', 'Mark Terminal'),
  c('Loop Guard', 'Re-invoke?'),
  cIf('Re-invoke?', 'Re-invoke', 'Mark Terminal'),
  // A failed Re-invoke used to be a silent dead end.
  c('Re-invoke', 'Re-invoked?'),
  cIfFalseOnly('Re-invoked?', 'Notify Re-invoke Failed'),
  c('Notify Re-invoke Failed', 'Mark Terminal'),
  c('Mark Terminal', 'Notify Stopped'),
);

const workflow = {
  name: 'FishPin Ad Creative -> FB (Approve)',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: ERROR_WF, timezone: TZ },
};
const out = path.join(__dirname, 'fishpin-fb-ads.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
