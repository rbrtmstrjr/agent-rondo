// Assembles fishpin-fb-ads.workflow.json.
// Libs are inlined VERBATIM ahead of each glue file: their `module.exports` is
// guarded by `typeof module !== 'undefined'`, which is false in the n8n Code
// sandbox, so no source transformation is needed.
// Run: node build.js
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
// Libs are inlined verbatim except for their trailing `module.exports` line(s):
// that line is always dead code in the n8n sandbox (`module` is undefined
// there, so the `typeof module !== 'undefined'` guard is always false), and
// dropping it — rather than the guard wrapper around it — leaves every lib's
// real logic untouched while guaranteeing no Code node ships a bare
// `module.exports =` for the sandbox-safety check to trip on, regardless of
// which of the two equivalent guard styles a given lib happens to use.
const lib = (n) => read(path.join('lib', n)).split('\n').filter((l) => !/module\.exports/.test(l)).join('\n');
const glue = (n) => read(path.join('nodes', n));
const code = (libs, g) => libs.map(lib).join('\n\n') + '\n\n' + glue(g);

const GEMINI = { id: 'S0qfsjLzQfKC04iG', name: 'Gemini - Brand Variations' };
const SHEETS = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
// Created by the owner after the Meta setup; see README section "Facebook token".
const FB = { id: 'FB_CRED_ID', name: 'FB Page - FishPin' };

const ERROR_WF = '660Xkpo164VSNTDZ';
const WEBHOOK_PATH = 'fishpin-ad';
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

const nodes = [
  { parameters: { rule: { interval: [
      { field: 'cronExpression', expression: '30 5 * * 1,3,5' },
      { field: 'cronExpression', expression: '30 18 * * 1,3,5' },
    ] } },
    id: 'n-sched', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(-620, 200) },
  { parameters: {}, id: 'n-man', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(-620, 360) },
  { parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'lastNode', options: {} },
    id: 'n-wh', name: 'Loop Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(-620, 520), webhookId: 'fishpin-ad-hook' },

  { parameters: { assignments: { assignments: [
      { id: 'c1', name: 'pageId', value: 'FILL_IN_FISHPIN_PAGE_ID', type: 'string' },
      { id: 'c2', name: 'graphVersion', value: 'v21.0', type: 'string' },
      { id: 'c3', name: 'sheetId', value: 'FILL_IN_SHEET_ID', type: 'string' },
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
      { id: 'c14', name: 'appPrice', value: 499, type: 'number' },
      { id: 'c15', name: 'playStoreUrl', value: 'https://play.google.com/store/apps/details?id=app.fishpin', type: 'string' },
      { id: 'c16', name: 'selfWebhookUrl', value: 'https://n8n.srv1193790.hstgr.cloud/webhook/' + WEBHOOK_PATH, type: 'string' },
    ] }, options: {} },
    id: 'n-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-400, 360) },

  http('n-read', 'Load Queue Row', {
    method: 'GET', url: sheetUrl("/values/' + $('Config').first().json.queueTab + '!A1:P1000"),
    nodeCredentialType: 'googleApi', options: {},
  }, -180, 360, { googleApi: SHEETS }),
  codeNode('n-pick', 'Pick Row', code(['sheet-rules.js'], 'load-queue.js'), 40, 360),
  ifNode('n-empty', 'Queue Empty?', '={{ !$json.found }}', 260, 360),
  slackMsg('n-empty-msg', 'Notify Queue Empty', cfgVal('opsChannel'),
    '=:inbox_tray: FishPin ad queue is empty. Nothing was posted. Add rows with status=ready.', 480, 200),

  // Targeted single-cell write to column G (status) of THIS row. Appending here
  // would add a second row with the same id, leaving the original still 'ready'
  // for the next scheduled run to pick up again.
  http('n-claim', 'Claim Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [{ range: $('Config').first().json.queueTab + '!G' + $('Pick Row').first().json.row._rowNumber, values: [['in_review']] }] }) }}",
    options: {},
  }, 480, 420, { googleApi: SHEETS }),

  codeNode('n-cprompt', 'Build Copy Prompt', code(['brand.js'], 'build-copy-prompt.js'), 700, 420),
  http('n-copy', 'Generate Copy', {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.copyModel + ':generateContent' }}",
    nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
    options: { timeout: 60000 },
  }, 920, 420, { googlePalmApi: GEMINI }),
  codeNode('n-vcopy', 'Validate Copy', code(['brand.js', 'copy-rules.js'], 'validate-copy.js'), 1140, 420),
  ifNode('n-ifcopy', 'Copy Valid?', '={{ $json.valid }}', 1360, 420),

  codeNode('n-iprompt', 'Build Image Prompt', code(['image-rules.js'], 'build-image-prompt.js'), 1580, 340),
  http('n-img', 'Generate Image', {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.imageModel + ':generateContent' }}",
    nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
    options: { timeout: 120000 },
  }, 1800, 340, { googlePalmApi: GEMINI }, 2),
  codeNode('n-vimg', 'Validate Image', code(['image-rules.js'], 'validate-image.js'), 2020, 340),
  ifNode('n-ifimg', 'Image Valid?', '={{ $json.valid }}', 2240, 340),
  slackMsg('n-imgfail', 'Notify Image Failed', cfgVal('opsChannel'),
    "=:warning: FishPin ad image generation FAILED for row {{ $('Pick Row').first().json.row.id }}. Nothing was posted.\nReasons: {{ $('Validate Image').first().json.reasons.join('; ') }}",
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

  codeNode('n-att', 'Log Attempt', code(['sheet-rules.js'], 'log-attempt.js'), 2900, 260),
  http('n-attw', 'Write Attempt', {
    method: 'POST', url: sheetUrl("/values/' + $('Config').first().json.attemptsTab + '!A:I:append"),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ values: [[ $json.ts, $json.row_id, $json.attempt, $json.pillar, $json.headline, $json.caption, $json.image_url, $json.decision, $json.revision_note ]] }) }}',
    sendQuery: true, queryParameters: { parameters: [
      { name: 'valueInputOption', value: 'RAW' },
      { name: 'insertDataOption', value: 'INSERT_ROWS' },
    ] }, options: {},
  }, 3120, 260, { googleApi: SHEETS }),

  slack('n-prev', 'Post Preview', {
    channelId: { __rl: true, value: cfgVal('reviewChannel'), mode: 'id' },
    text: "=*FishPin ad ready for review* — `{{ $('Pick Row').first().json.row.id }}` · _{{ $('Pick Row').first().json.row.pillar }}_ · attempt {{ $('Pick Row').first().json.attempt }} of {{ $('Config').first().json.maxAttempts }}\n\n*Headline:* {{ $('Validate Copy').first().json.copy.headline }}\n*Subhead:* {{ $('Validate Copy').first().json.copy.subhead }}\n\n{{ $('Validate Copy').first().json.copy.caption }}\n\n{{ $('Validate Copy').first().json.copy.cta }}\n{{ $('Validate Copy').first().json.copy.hashtags.join(' ') }}\n\n{{ $('Get Photo URL').first().json.images[0].source }}",
    otherOptions: {},
  }, 3340, 260),

  slack('n-rev', 'Slack Review', {
    operation: 'sendAndWait',
    channelId: { __rl: true, value: cfgVal('reviewChannel'), mode: 'id' },
    message: "=Review the FishPin ad above (`{{ $('Pick Row').first().json.row.id }}`, attempt {{ $('Pick Row').first().json.attempt }} of {{ $('Config').first().json.maxAttempts }}).",
    responseType: 'customForm',
    formFields: { values: [
      { fieldLabel: 'Decision', fieldType: 'dropdown', requiredField: true,
        fieldOptions: { values: [
          { option: 'Approve' }, { option: 'Regenerate copy' },
          { option: 'Regenerate image' }, { option: 'Regenerate both' },
        ] } },
      { fieldLabel: 'Reason', fieldType: 'textarea', requiredField: false },
    ] },
    options: { limitWaitTime: true, resumeAmount: '={{ $(\'Config\').first().json.reviewTimeoutHours }}', resumeUnit: 'hours' },
  }, 3560, 260),

  codeNode('n-route', 'Route Decision', code(['flow-rules.js'], 'route-decision.js'), 3780, 260),
  ifNode('n-ifapp', 'Approved?', '={{ $json.approved }}', 4000, 260),

  http('n-pub', 'Publish Post', {
    method: 'POST',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Config').first().json.pageId + '/feed' }}",
    nodeCredentialType: 'facebookGraphApi', sendBody: true, contentType: 'form-urlencoded',
    bodyParameters: { parameters: [
      { name: 'message', value: "={{ $json.copy.caption + '\\n\\n' + $json.copy.cta + '\\n\\n' + $json.copy.hashtags.join(' ') }}" },
      { name: 'attached_media', value: "={{ JSON.stringify([{ media_fbid: $json.media_fbid }]) }}" },
    ] }, options: {},
  }, 4220, 180, { facebookGraphApi: FB }),
  codeNode('n-wb', 'Write Back', code(['sheet-rules.js'], 'map-writeback.js'), 4440, 180),
  // Two targeted ranges in one call: G = status, I:L = caption, image_url,
  // fb_post_id, posted_at. Column H (scheduled_for) is deliberately skipped so
  // the human's value is not blanked.
  http('n-wbw', 'Write Back Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [ { range: $('Config').first().json.queueTab + '!G' + $json._rowNumber, values: [[ $json.status ]] }, { range: $('Config').first().json.queueTab + '!I' + $json._rowNumber + ':L' + $json._rowNumber, values: [[ $json.caption, $json.image_url, $json.fb_post_id, $json.posted_at ]] } ] }) }}",
    options: {},
  }, 4660, 180, { googleApi: SHEETS }),
  slackMsg('n-ok', 'Notify Success', cfgVal('opsChannel'),
    "=:white_check_mark: Posted to the FishPin Page — row `{{ $('Route Decision').first().json.row_id }}` ({{ $('Route Decision').first().json.pillar }})\nPost id: {{ $('Publish Post').first().json.id }}\n{{ $('Route Decision').first().json.image_url }}",
    4880, 180),

  codeNode('n-guard', 'Loop Guard', code(['flow-rules.js'], 'loop-guard.js'), 4220, 400),
  ifNode('n-ifloop', 'Re-invoke?', '={{ $json.reinvoke }}', 4440, 400),
  http('n-re', 'Re-invoke', {
    method: 'POST', url: cfgVal('selfWebhookUrl'),
    authentication: 'none', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.payload) }}',
    options: {},
  }, 4660, 340, {}),
  http('n-term', 'Mark Terminal', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [{ range: $('Config').first().json.queueTab + '!G' + $('Pick Row').first().json.row._rowNumber, values: [[ $json.status ]] }] }) }}",
    options: {},
  }, 4660, 460, { googleApi: SHEETS }),
  slackMsg('n-stop', 'Notify Stopped', cfgVal('opsChannel'),
    '=:octagonal_sign: {{ $json.message }}', 4880, 460),
];

const c = (from, to) => ({ [from]: { main: [[{ node: to, type: 'main', index: 0 }]] } });
const cIf = (from, t, f) => ({ [from]: { main: [
  [{ node: t, type: 'main', index: 0 }], [{ node: f, type: 'main', index: 0 }]] } });

const connections = Object.assign({},
  c('Schedule Trigger', 'Config'),
  c('Manual Trigger', 'Config'),
  c('Loop Webhook', 'Config'),
  c('Config', 'Load Queue Row'),
  c('Load Queue Row', 'Pick Row'),
  c('Pick Row', 'Queue Empty?'),
  cIf('Queue Empty?', 'Notify Queue Empty', 'Claim Row'),
  c('Claim Row', 'Build Copy Prompt'),
  c('Build Copy Prompt', 'Generate Copy'),
  c('Generate Copy', 'Validate Copy'),
  c('Validate Copy', 'Copy Valid?'),
  cIf('Copy Valid?', 'Build Image Prompt', 'Loop Guard'),
  c('Build Image Prompt', 'Generate Image'),
  c('Generate Image', 'Validate Image'),
  c('Validate Image', 'Image Valid?'),
  cIf('Image Valid?', 'Upload Photo (unpublished)', 'Notify Image Failed'),
  c('Upload Photo (unpublished)', 'Get Photo URL'),
  c('Get Photo URL', 'Log Attempt'),
  c('Log Attempt', 'Write Attempt'),
  c('Write Attempt', 'Post Preview'),
  c('Post Preview', 'Slack Review'),
  c('Slack Review', 'Route Decision'),
  c('Route Decision', 'Approved?'),
  cIf('Approved?', 'Publish Post', 'Loop Guard'),
  c('Publish Post', 'Write Back'),
  c('Write Back', 'Write Back Row'),
  c('Write Back Row', 'Notify Success'),
  c('Loop Guard', 'Re-invoke?'),
  cIf('Re-invoke?', 'Re-invoke', 'Mark Terminal'),
  c('Mark Terminal', 'Notify Stopped'),
);

const workflow = {
  name: 'FishPin Ad Creative -> FB (Approve)',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: ERROR_WF },
};
const out = path.join(__dirname, 'fishpin-fb-ads.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
