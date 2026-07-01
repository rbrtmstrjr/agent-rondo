// Assembles content-repurposing.workflow.json
// Input → Gemini drafts (4 platforms) + image → Airtable board → Slack approve → update.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const getSourceCode = read('get-source.js');
const parseCode = read('parse-content.js');
const validateImgCode = read('validate-image.js');

const GEMINI = { id: '0eINQFptxG4T1uH7', name: 'epic catch api' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
const AIRTABLE = { id: 'sSLblszJWxpUr8fl', name: 'Airtable - Northwind' };
const BASE_ID = 'appug80MzHJWdeZNU';
const TABLE_ID = 'tblURbYKPLR5CWWHk';
const IMAGE_FIELD = 'fldlhfj3EliOLkWxp';
const CHANNEL = 'C0BDSV5RB5G';

const pos = (x, y) => [x, y];
const codeNode = (id, name, code, x, y) => ({ parameters: { jsCode: code }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, y) });
const gemini = (id, name, modelCfgKey, bodyExpr, x, y) => ({
  parameters: {
    method: 'POST',
    url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json." + modelCfgKey + " + ':generateContent' }}",
    authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
    sendBody: true, specifyBody: 'json', jsonBody: bodyExpr,
    options: { response: { response: { neverError: false } }, timeout: 120000 },
  }, id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: 'continueRegularOutput', credentials: { googlePalmApi: GEMINI },
});
const airtable = (id, name, method, urlExpr, bodyExpr, x, y) => ({
  parameters: {
    method, url: urlExpr,
    authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
    sendBody: bodyExpr ? true : false, specifyBody: 'json', jsonBody: bodyExpr,
    options: { response: { response: { neverError: false } } },
  }, id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: 3, waitBetweenTries: 1500, onError: 'continueRegularOutput', credentials: { airtableTokenApi: AIRTABLE },
});
const ifBool = (id, name, leftExpr, x, y, loose) => ({
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: loose ? 'loose' : 'strict', version: 2 },
    conditions: [{ id: 'c', leftValue: leftExpr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(x, y),
});
const respond = (id, name, bodyExpr, x, y, code) => ({ parameters: { respondWith: 'json', responseBody: bodyExpr, options: code ? { responseCode: code } : {} }, id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos(x, y) });

const recId = "$('Create Airtable Record').first().json.id";
const recUrl = "'https://airtable.com/' + $('Config').first().json.baseId + '/' + $('Config').first().json.contentTableId + '/' + " + recId;

const nodes = [
  { parameters: { httpMethod: 'POST', path: 'content-northwind', responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    id: 'n-wh', name: 'Content Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(-380, 300), webhookId: 'content-northwind-hook' },
  { parameters: { assignments: { assignments: [
      { id: 'c1', name: 'companyName', value: 'Northwind Home Services', type: 'string' },
      { id: 'c2', name: 'phone', value: '(555) 010-4729', type: 'string' },
      { id: 'c3', name: 'brandVoice', value: 'helpful, friendly, trustworthy, and practical', type: 'string' },
      { id: 'c4', name: 'chatModel', value: 'gemini-2.5-flash', type: 'string' },
      { id: 'c5', name: 'imageModel', value: 'gemini-3.1-flash-image', type: 'string' },
      { id: 'c6', name: 'baseId', value: BASE_ID, type: 'string' },
      { id: 'c7', name: 'contentTableId', value: TABLE_ID, type: 'string' },
      { id: 'c8', name: 'imageFieldId', value: IMAGE_FIELD, type: 'string' },
      { id: 'c9', name: 'channel', value: CHANNEL, type: 'string' },
    ] }, options: {} },
    id: 'n-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-160, 300) },
  codeNode('n-src', 'Get Source & Build Prompt', getSourceCode, 60, 300),
  ifBool('n-ifvalid', 'Valid?', '={{ $json.valid }}', 280, 300),
  gemini('n-gen', 'Generate Content', 'chatModel', '={{ $json.geminiBody }}', 500, 200),
  codeNode('n-parse', 'Parse Content', parseCode, 720, 200),
  gemini('n-img', 'Generate Image', 'imageModel', "={{ $('Parse Content').first().json.imageGeminiBody }}", 940, 200),
  codeNode('n-vimg', 'Validate Image', validateImgCode, 1160, 200),
  airtable('n-create', 'Create Airtable Record', 'POST',
    "={{ 'https://api.airtable.com/v0/' + $('Config').first().json.baseId + '/' + $('Config').first().json.contentTableId }}",
    "={{ $('Parse Content').first().json.airtableBody }}", 1380, 200),
  ifBool('n-ifimg', 'Image ok?', "={{ $('Validate Image').first().json.imageOk }}", 1600, 200),
  airtable('n-upimg', 'Upload Image', 'POST',
    "={{ 'https://content.airtable.com/v0/' + $('Config').first().json.baseId + '/' + " + recId + " + '/' + $('Config').first().json.imageFieldId + '/uploadAttachment' }}",
    "={{ $('Validate Image').first().json.uploadBody }}", 1820, 110),
  respond('n-resp', 'Respond Drafts',
    "={{ JSON.stringify({ ok:true, recordId: " + recId + ", title: $('Parse Content').first().json.title, status:'Pending Approval', airtableUrl: " + recUrl + ", imageAttached: $('Validate Image').first().json.imageOk, drafts: { linkedin: $('Parse Content').first().json.airtableBody.fields.LinkedIn, twitter: $('Parse Content').first().json.airtableBody.fields['X / Twitter'], facebook: $('Parse Content').first().json.airtableBody.fields.Facebook, instagram: $('Parse Content').first().json.airtableBody.fields.Instagram } }) }}",
    2040, 200),
  { parameters: {
      operation: 'sendAndWait', select: 'channel',
      channelId: { __rl: true, value: "={{ $('Config').first().json.channel }}", mode: 'id' },
      message: "=📣 *New content ready to review — " + "{{ $('Parse Content').first().json.title }}*\n\n{{ $('Parse Content').first().json.summary }}\n\nReview all drafts + the image in Airtable:\n{{ " + recUrl + " }}\n\n*Approve* to mark ready-to-publish, or *Reject* to discard.",
      approvalOptions: { values: { approvalType: 'double' } }, options: {},
    }, id: 'n-wait', name: 'Approval (Send & Wait)', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(2260, 200),
    onError: 'continueRegularOutput', credentials: { slackApi: SLACK } },
  ifBool('n-ifapp', 'Approved?', '={{ $json.data.approved }}', 2480, 200, true),
  airtable('n-appr', 'Mark Approved', 'PATCH',
    "={{ 'https://api.airtable.com/v0/' + $('Config').first().json.baseId + '/' + $('Config').first().json.contentTableId + '/' + " + recId + " }}",
    "={{ JSON.stringify({ fields: { Status: 'Approved' } }) }}", 2700, 110),
  airtable('n-rej', 'Mark Rejected', 'PATCH',
    "={{ 'https://api.airtable.com/v0/' + $('Config').first().json.baseId + '/' + $('Config').first().json.contentTableId + '/' + " + recId + " }}",
    "={{ JSON.stringify({ fields: { Status: 'Rejected' } }) }}", 2700, 300),
  respond('n-bad', 'Respond Invalid', "={{ JSON.stringify({ ok:false, error: $('Get Source & Build Prompt').first().json.reason }) }}", 500, 440, 422),
];

const connections = {
  'Content Webhook': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Get Source & Build Prompt', type: 'main', index: 0 }]] },
  'Get Source & Build Prompt': { main: [[{ node: 'Valid?', type: 'main', index: 0 }]] },
  'Valid?': { main: [[{ node: 'Generate Content', type: 'main', index: 0 }], [{ node: 'Respond Invalid', type: 'main', index: 0 }]] },
  'Generate Content': { main: [[{ node: 'Parse Content', type: 'main', index: 0 }]] },
  'Parse Content': { main: [[{ node: 'Generate Image', type: 'main', index: 0 }]] },
  'Generate Image': { main: [[{ node: 'Validate Image', type: 'main', index: 0 }]] },
  'Validate Image': { main: [[{ node: 'Create Airtable Record', type: 'main', index: 0 }]] },
  'Create Airtable Record': { main: [[{ node: 'Image ok?', type: 'main', index: 0 }]] },
  'Image ok?': { main: [[{ node: 'Upload Image', type: 'main', index: 0 }], [{ node: 'Respond Drafts', type: 'main', index: 0 }]] },
  'Upload Image': { main: [[{ node: 'Respond Drafts', type: 'main', index: 0 }]] },
  'Respond Drafts': { main: [[{ node: 'Approval (Send & Wait)', type: 'main', index: 0 }]] },
  'Approval (Send & Wait)': { main: [[{ node: 'Approved?', type: 'main', index: 0 }]] },
  'Approved?': { main: [[{ node: 'Mark Approved', type: 'main', index: 0 }], [{ node: 'Mark Rejected', type: 'main', index: 0 }]] },
};

const workflow = { name: 'Content Repurposing → Airtable + Approve (Northwind)', nodes, connections, settings: { executionOrder: 'v1', errorWorkflow: '660Xkpo164VSNTDZ' } };
const out = path.join(__dirname, 'content-repurposing.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
