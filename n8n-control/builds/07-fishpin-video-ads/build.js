// Assembles fishpin-video-ads.workflow.json (build 07). Same pattern as build
// 06: every Code node is a glue file from nodes/ with the libs node-libs.js
// lists inlined ahead of it. Build 06's brand, copy and image rules are
// inlined straight from ../06-fishpin-fb-ads/lib, never copied.
//
// Run:     node build.js   (placeholders: this is the file that is committed)
// Deploy:  set FISHPIN_VIDEO_TRIGGER_SECRET and FISHPIN_RENDER_TOKEN, then node build.js
const fs = require('fs');
const path = require('path');
const { assemble } = require('./node-libs.js');

const GEMINI = { id: 'S0qfsjLzQfKC04iG', name: 'Gemini - Brand Variations' };
const SHEETS = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
// Owner's choice from the live spike (execution 2985, 2026-09-16): Algenib
// (rejected: Gacrux and Achird).
const TTS_VOICE = 'Algenib';

const ERROR_WF = '660Xkpo164VSNTDZ';
const TZ = 'Asia/Manila';
const WEBHOOK_PATH = 'fishpin-video-ad';
// Never hardcoded: the repo and the built JSON are pushed to GitHub.
const TRIGGER_SECRET = process.env.FISHPIN_VIDEO_TRIGGER_SECRET || 'FILL_IN_VIDEO_TRIGGER_SECRET';
const RENDER_TOKEN = process.env.FISHPIN_RENDER_TOKEN || 'FILL_IN_RENDER_TOKEN';

const G = 'https://generativelanguage.googleapis.com/v1beta/';
const SHEET_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const cfg = (k) => "$('Config').first().json." + k;
const sheetUrl = (suffix) => "={{ '" + SHEET_BASE + "/' + " + cfg('sheetId') + " + '" + suffix + "' }}";

const idOf = (name) => 'n-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const at = (x, y) => [x, y];

const AUTH = {
  gemini: { params: { authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi' }, cred: { googlePalmApi: GEMINI } },
  sheets: { params: { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleApi' }, cred: { googleApi: SHEETS } },
  slack: { params: { authentication: 'predefinedCredentialType', nodeCredentialType: 'slackApi' }, cred: { slackApi: SLACK } },
  none: { params: { authentication: 'none' }, cred: null },
};

// tries: 1 for anything that costs money, creates a row, or posts: a retry
// after a dropped connection could do it twice.
const http = (name, auth, params, xy, opts) => {
  const o = Object.assign({ tries: 3, onError: 'continueRegularOutput' }, opts || {});
  const a = AUTH[auth];
  const node = {
    parameters: Object.assign({}, a.params, params),
    id: idOf(name), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: xy, onError: o.onError,
  };
  if (o.tries > 1) Object.assign(node, { retryOnFail: true, maxTries: o.tries, waitBetweenTries: 2000 });
  if (a.cred) node.credentials = a.cred;
  return node;
};
const codeNode = (name, file, xy) => ({
  parameters: { jsCode: assemble(file) }, id: idOf(name), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: xy,
});
const ifNode = (name, leftValue, xy) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'c', leftValue, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, options: {} },
  id: idOf(name), name, type: 'n8n-nodes-base.if', typeVersion: 2, position: xy,
});
const waitNode = (name, seconds, xy) => ({
  parameters: { amount: seconds, unit: 'seconds' }, id: idOf(name), name, type: 'n8n-nodes-base.wait', typeVersion: 1.1,
  position: xy, webhookId: 'fishpin-video-' + idOf(name),
});
const slackMsg = (name, text, xy) => ({
  parameters: { select: 'channel', channelId: { __rl: true, value: '={{ ' + cfg('opsChannel') + ' }}', mode: 'id' }, text, otherOptions: {} },
  id: idOf(name), name, type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: xy,
  onError: 'continueRegularOutput', credentials: { slackApi: SLACK },
});
const gemini = (name, modelKey, action, jsonBody, xy, opts) => http(name, 'gemini', {
  method: 'POST', url: "={{ '" + G + "models/' + " + cfg(modelKey) + " + ':" + action + "' }}",
  sendBody: true, specifyBody: 'json', jsonBody, options: { timeout: 120000 },
}, xy, opts);
const sheetWrite = (name, xy, opts) => http(name, 'sheets', {
  method: 'POST', url: sheetUrl('/values:batchUpdate'), sendBody: true, specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.sheet_body) }}', options: {},
}, xy, opts);
const slackApi = (name, method, params, xy, opts) => http(name, 'slack',
  Object.assign({ method: 'POST', url: 'https://slack.com/api/' + method }, params), xy, opts);
const A = (name, value) => ({ id: 'c-' + name, name, value, type: typeof value === 'number' ? 'number' : 'string' });

const nodes = [
  // ---- triggers and config
  { parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'onReceived', options: {} },
    id: idOf('Trigger Webhook'), name: 'Trigger Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: at(0, 200),
    webhookId: 'fishpin-video-ad-hook' },
  { parameters: {}, id: idOf('Manual Trigger'), name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: at(0, 420) },
  { parameters: { assignments: { assignments: [
      A('sheetId', '1tdud2e5BKy7IQ7wpYy8Iavl_hOK8vUBrUs1oYj1Cp3E'), A('videosTab', 'Videos'),
      A('deliveryChannel', 'C0C1WS8PAAJ'), A('opsChannel', 'C0C1WS8PAAJ'),
      A('scriptModel', 'gemini-2.5-flash'), A('scriptTemperature', 0.9), A('imageModel', 'gemini-2.5-flash-image'),
      A('veoModel', 'veo-3.1-lite-generate-preview'), A('veoSeconds', 8), A('veoResolution', '1080p'), A('veoMaxWaitMinutes', 8),
      A('ttsModel', 'gemini-3.1-flash-tts-preview'), A('ttsVoice', TTS_VOICE), A('maxScriptRetries', 3),
      A('renderUrl', 'http://172.18.0.1:8090/render-ad'),
      A('websiteUrl', 'www.fishpin.app'), A('playStoreUrl', 'https://play.google.com/store/apps/details?id=com.fishpin.app'),
      A('endCardCta', 'I-download sa Play Store'), A('endCardSeconds', 3.5), A('postCta', 'I-download ang FishPin sa Play Store.'),
      A('triggerSecret', TRIGGER_SECRET), A('renderToken', RENDER_TOKEN),
    ] }, options: {} },
    id: idOf('Config'), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: at(220, 300) },

  // ---- run and row
  http('Load Videos', 'sheets', { method: 'GET', url: sheetUrl("/values/' + " + cfg('videosTab') + " + '!A1:J2000"), options: {} }, at(440, 300)),
  codeNode('Start Run', 'start-run.js', at(660, 300)),
  ifNode('Started?', '={{ $json.ok }}', at(880, 300)),
  http('Append Row', 'sheets', {
    method: 'POST', url: sheetUrl("/values/' + " + cfg('videosTab') + " + '!A:J:append"),
    sendQuery: true, queryParameters: { parameters: [{ name: 'valueInputOption', value: 'RAW' }, { name: 'insertDataOption', value: 'INSERT_ROWS' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ values: [ $json.new_row ] }) }}', options: {},
  }, at(1100, 300), { tries: 1 }),
  codeNode('Set Row', 'set-row.js', at(1320, 300)),
  ifNode('Row OK?', '={{ $json.ok }}', at(1540, 300)),

  // ---- script
  codeNode('Build Script Request', 'build-script-request.js', at(1760, 300)),
  gemini('Generate Script', 'scriptModel', 'generateContent', '={{ $json.geminiBody }}', at(1980, 300)),
  codeNode('Validate Script', 'validate-script.js', at(2200, 300)),
  ifNode('Script Valid?', '={{ $json.valid }}', at(2420, 300)),
  ifNode('Retry Script?', '={{ $json.retry }}', at(2640, 500)),

  // ---- voice, then pictures, then the clip: cheapest first
  codeNode('Build TTS Request', 'build-tts-request.js', at(2640, 300)),
  gemini('TTS', 'ttsModel', 'generateContent', '={{ $json.geminiBody }}', at(2860, 300)),
  codeNode('Voice WAV', 'voice-wav.js', at(3080, 300)),
  ifNode('Voice OK?', '={{ $json.ok }}', at(3300, 300)),
  // FAN-OUT: one item per picture. Never read Generate Image with .first().
  codeNode('Build Image Requests', 'build-image-requests.js', at(3520, 300)),
  gemini('Generate Image', 'imageModel', 'generateContent', '={{ $json.geminiBody }}', at(3740, 300), { tries: 2 }),
  codeNode('Collect Images', 'collect-images.js', at(3960, 300)),
  ifNode('Images OK?', '={{ $json.ok }}', at(4180, 300)),
  codeNode('Build Veo Request', 'build-veo-request.js', at(4400, 300)),
  gemini('Veo Start', 'veoModel', 'predictLongRunning', '={{ $json.veoBody }}', at(4620, 300), { tries: 1 }),
  codeNode('Check Veo Start', 'check-veo-start.js', at(4840, 300)),
  ifNode('Veo Started?', '={{ $json.started }}', at(5060, 300)),
  waitNode('Wait Veo', 15, at(5280, 140)),
  http('Veo Poll', 'gemini', { method: 'GET', url: "={{ '" + G + "' + $('Check Veo Start').first().json.name }}", options: {} }, at(5500, 140)),
  codeNode('Check Veo Poll', 'check-veo-poll.js', at(5720, 140)),
  ifNode('Veo Pending?', "={{ $json.state === 'pending' }}", at(5940, 140)),
  ifNode('Veo Clip?', "={{ $json.state === 'done' }}", at(6160, 140)),
  http('Veo Download', 'gemini', { method: 'GET', url: '={{ $json.uri }}',
    options: { timeout: 120000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } } }, at(6380, 140)),

  // ---- render
  codeNode('Build Render Payload', 'build-render-payload.js', at(6600, 300)),
  ifNode('Payload OK?', '={{ $json.ok }}', at(6820, 300)),
  http('Render', 'none', {
    method: 'POST', url: '={{ ' + cfg('renderUrl') + ' }}',
    sendHeaders: true, headerParameters: { parameters: [
      { name: 'X-Render-Token', value: '={{ ' + cfg('renderToken') + ' }}' },
      { name: 'Content-Type', value: 'application/json' },
    ] },
    sendBody: true, contentType: 'binaryData', inputDataFieldName: 'payload',
    options: { timeout: 600000, response: { response: { responseFormat: 'file', outputPropertyName: 'data', neverError: true } } },
  }, at(7040, 300), { tries: 1 }),
  codeNode('Check Render', 'check-render.js', at(7260, 300)),
  ifNode('Render OK?', '={{ $json.ok }}', at(7480, 300)),

  // ---- Slack delivery (external upload pattern)
  slackApi('Slack Upload URL', 'files.getUploadURLExternal', { method: 'GET', sendQuery: true, queryParameters: { parameters: [
    { name: 'filename', value: "={{ $('Check Render').first().json.file_name }}" },
    { name: 'length', value: "={{ $('Check Render').first().json.bytes }}" },
  ] }, options: {} }, at(7700, 300)),
  codeNode('Reattach Video', 'reattach-video.js', at(7920, 300)),
  ifNode('Upload Ready?', '={{ $json.ok }}', at(8140, 300)),
  http('Slack Push Bytes', 'none', { method: 'POST', url: '={{ $json.upload_url }}', sendBody: true, contentType: 'binaryData',
    inputDataFieldName: 'video', options: { timeout: 300000 } }, at(8360, 300)),
  slackApi('Slack Complete', 'files.completeUploadExternal', { sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ files: [{ id: $('Reattach Video').first().json.file_id, title: $('Check Render').first().json.file_name }] }) }}",
    options: {} }, at(8580, 300)),
  waitNode('Wait 5s', 5, at(8800, 300)),
  slackApi('Post Video', 'chat.postMessage', { sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ channel: " + cfg('deliveryChannel') + ", text: $('Check Render').first().json.message_text + '\\n\\n*Video:* ' + ((($('Slack Complete').first().json.files || [])[0] || {}).permalink || '(link unavailable)') }) }}",
    options: {} }, at(9020, 300), { tries: 1 }),
  codeNode('Check Delivery', 'check-delivery.js', at(9240, 300)),
  ifNode('Delivered?', '={{ $json.ok }}', at(9460, 300)),
  sheetWrite('Mark Delivered', at(9680, 300)),

  // ---- the single failure sink
  codeNode('Stop', 'stop.js', at(6600, 820)),
  ifNode('Has Row?', '={{ $json.has_row }}', at(6820, 820)),
  sheetWrite('Mark Terminal', at(7040, 740)),
  slackMsg('Notify Stopped', "=:octagonal_sign: {{ $('Stop').first().json.message }}\nRow status: {{ $('Stop').first().json.status }}", at(7260, 820)),
];

const connections = {};
const link = (from, to, branch) => {
  const b = branch || 0;
  connections[from] = connections[from] || { main: [] };
  while (connections[from].main.length <= b) connections[from].main.push([]);
  connections[from].main[b].push({ node: to, type: 'main', index: 0 });
};
const chain = (...names) => names.slice(1).forEach((n, i) => link(names[i], n));
const branch = (ifName, onTrue, onFalse) => { link(ifName, onTrue, 0); link(ifName, onFalse, 1); };

link('Trigger Webhook', 'Config');
link('Manual Trigger', 'Config');
chain('Config', 'Load Videos', 'Start Run', 'Started?');
branch('Started?', 'Append Row', 'Stop');
chain('Append Row', 'Set Row', 'Row OK?');
branch('Row OK?', 'Build Script Request', 'Stop');
chain('Build Script Request', 'Generate Script', 'Validate Script', 'Script Valid?');
branch('Script Valid?', 'Build TTS Request', 'Retry Script?');
branch('Retry Script?', 'Build Script Request', 'Stop');
chain('Build TTS Request', 'TTS', 'Voice WAV', 'Voice OK?');
branch('Voice OK?', 'Build Image Requests', 'Stop');
chain('Build Image Requests', 'Generate Image', 'Collect Images', 'Images OK?');
branch('Images OK?', 'Build Veo Request', 'Stop');
chain('Build Veo Request', 'Veo Start', 'Check Veo Start', 'Veo Started?');
branch('Veo Started?', 'Wait Veo', 'Build Render Payload');
chain('Wait Veo', 'Veo Poll', 'Check Veo Poll', 'Veo Pending?');
branch('Veo Pending?', 'Wait Veo', 'Veo Clip?');
branch('Veo Clip?', 'Veo Download', 'Build Render Payload');
chain('Veo Download', 'Build Render Payload', 'Payload OK?');
branch('Payload OK?', 'Render', 'Stop');
chain('Render', 'Check Render', 'Render OK?');
branch('Render OK?', 'Slack Upload URL', 'Stop');
chain('Slack Upload URL', 'Reattach Video', 'Upload Ready?');
branch('Upload Ready?', 'Slack Push Bytes', 'Stop');
chain('Slack Push Bytes', 'Slack Complete', 'Wait 5s', 'Post Video', 'Check Delivery', 'Delivered?');
branch('Delivered?', 'Mark Delivered', 'Stop');
chain('Stop', 'Has Row?');
branch('Has Row?', 'Mark Terminal', 'Notify Stopped');
chain('Mark Terminal', 'Notify Stopped');

const workflow = {
  name: 'FishPin Video Ad -> Slack',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: ERROR_WF, timezone: TZ },
};
const out = path.join(__dirname, 'fishpin-video-ads.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
