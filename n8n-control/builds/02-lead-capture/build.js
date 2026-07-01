// Assembles lead-capture.workflow.json — Lead Capture → Enrich → Sheet → Email + Slack.
// Run: node build.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const validateCode = read('validate.js');
const parseCode = read('parse-ai.js');

const GEMINI = { id: '0eINQFptxG4T1uH7', name: 'epic catch api' };
const GOOGLE = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
const SMTP = { id: 'rBlnSWuFVlszoV1S', name: 'Gmail SMTP - Northwind' };
const LEAD_CHANNEL = 'C0BDSV5RB5G';        // #chatbot-automation (reused; swap to a #leads channel anytime)
const SHEET_ID = '1tz1m4g5tvTxBunlVjD_GEIfPF_Ghxs5WC0ihMn_qWS0'; // dedicated "Northwind Leads" sheet (user-owned, shared to SA)
const WEBHOOK_PATH = 'lead-northwind';

const HEADERS = ['Timestamp', 'Name', 'Email', 'Phone', 'ZIP', 'Service (form)', 'How soon', 'Message',
  'AI Summary', 'Service Type', 'Urgency', 'In Area', 'Value', 'Score', 'Temperature', 'Reason', 'Status'];

const pos = (x, y) => [x, y];
const codeNode = (id, name, code, x, y = 300) => ({
  parameters: { jsCode: code }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, y),
});
const ifNode = (id, name, leftExpr, x, y = 300) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'c', leftValue: leftExpr, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    }, options: {},
  }, id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(x, y),
});
const httpNode = (id, name, method, urlExpr, bodyExpr, cred, x, y = 300) => ({
  parameters: {
    method, url: urlExpr,
    authentication: 'predefinedCredentialType', nodeCredentialType: cred.type,
    sendBody: bodyExpr ? true : false, specifyBody: 'json', jsonBody: bodyExpr,
    options: { response: { response: { neverError: false } } },
  },
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: 3, waitBetweenTries: 1500,
  onError: 'continueRegularOutput', credentials: { [cred.credType]: cred.cred },
});
const gem = { type: 'googlePalmApi', credType: 'googlePalmApi', cred: GEMINI };
const goog = { type: 'googleApi', credType: 'googleApi', cred: GOOGLE };
const respond = (id, name, bodyExpr, x, y, code) => ({
  parameters: { respondWith: 'json', responseBody: bodyExpr, options: code ? { responseCode: code } : {} },
  id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos(x, y),
});
const sheetUrl = (tail) => "={{ 'https://sheets.googleapis.com/v4/spreadsheets/' + $('Config').first().json.sheetId" + tail + " }}";

const nodes = [
  { parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    id: 'n-webhook', name: 'Lead Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(-260, 300), webhookId: 'lead-northwind-hook' },
  { parameters: { assignments: { assignments: [
      { id: 'c1', name: 'companyName', value: 'Northwind Home Services', type: 'string' },
      { id: 'c2', name: 'phone', value: '(555) 010-4729', type: 'string' },
      { id: 'c3', name: 'fromEmail', value: 'robertmaestro09@gmail.com', type: 'string' },
      { id: 'c4', name: 'chatModel', value: 'gemini-2.5-flash', type: 'string' },
      { id: 'c5', name: 'sheetId', value: SHEET_ID, type: 'string' },
      { id: 'c6', name: 'sheetTab', value: 'Leads', type: 'string' },
      { id: 'c7', name: 'serviceAreas', value: 'Portland, Beaverton, Hillsboro, Tigard, Lake Oswego, Gresham, Milwaukie, Oregon City, Tualatin, West Linn', type: 'string' },
      { id: 'c8', name: 'hotThreshold', value: 70, type: 'number' },
      { id: 'c9', name: 'dedupMinutes', value: 10, type: 'number' },
      { id: 'c10', name: 'leadChannel', value: LEAD_CHANNEL, type: 'string' },
    ] }, options: {} },
    id: 'n-config', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-40, 300) },
  codeNode('n-validate', 'Validate & Prepare', validateCode, 180),
  ifNode('n-ifvalid', 'Valid input?', "={{ $('Validate & Prepare').first().json.valid }}", 400),
  ifNode('n-ifprocess', 'Process?', "={{ $('Validate & Prepare').first().json.process }}", 620, 220),
  httpNode('n-ai', 'AI Enrich + Score',
    'POST',
    "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.chatModel + ':generateContent' }}",
    '={{ $json.geminiBody }}', gem, 840, 160),
  codeNode('n-parse', 'Parse AI', parseCode, 1060, 160),
  httpNode('n-tab', 'Ensure Sheet Tab', 'POST', sheetUrl(" + ':batchUpdate'"),
    "={{ JSON.stringify({ requests: [{ addSheet: { properties: { title: $('Config').first().json.sheetTab } } }] }) }}", goog, 1280, 160),
  httpNode('n-headers', 'Set Headers', 'PUT', sheetUrl(" + '/values/' + $('Config').first().json.sheetTab + '!A1?valueInputOption=RAW'"),
    '={{ JSON.stringify({ values: [' + JSON.stringify(HEADERS) + '] }) }}', goog, 1500, 160),
  httpNode('n-append', 'Append Lead', 'POST', sheetUrl(" + '/values/' + $('Config').first().json.sheetTab + '!A:Q:append?valueInputOption=USER_ENTERED'"),
    "={{ JSON.stringify({ values: [ $('Parse AI').first().json.row ] }) }}", goog, 1720, 160),
  { parameters: {
      fromEmail: "={{ $('Config').first().json.fromEmail }}",
      toEmail: "={{ $('Parse AI').first().json.email.to }}",
      subject: "={{ $('Parse AI').first().json.email.subject }}",
      emailFormat: 'text',
      text: "={{ $('Parse AI').first().json.email.body }}",
      options: {},
    }, id: 'n-email', name: 'Email Homeowner', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: pos(1940, 160),
    onError: 'continueRegularOutput', credentials: { smtp: SMTP } },
  { parameters: {
      resource: 'message', operation: 'post', select: 'channel',
      channelId: { __rl: true, value: "={{ $('Config').first().json.leadChannel }}", mode: 'id' },
      text: "={{ $('Parse AI').first().json.slackText }}", otherOptions: {},
    }, id: 'n-slack', name: 'Slack Alert', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(2160, 160),
    onError: 'continueRegularOutput', credentials: { slackApi: SLACK } },
  // Responds to the form IMMEDIATELY (right after validation); the AI/Sheet/Email/Slack
  // work continues in the background after this node, so the form never waits on it.
  respond('n-ok', 'Respond OK (fast)', '={{ JSON.stringify({ ok: true }) }}', 620, 300),
  respond('n-invalid', 'Respond Invalid', "={{ JSON.stringify({ ok: false, error: $('Validate & Prepare').first().json.reason }) }}", 620, 460, 422),
];

const connections = {
  'Lead Webhook': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Validate & Prepare', type: 'main', index: 0 }]] },
  'Validate & Prepare': { main: [[{ node: 'Valid input?', type: 'main', index: 0 }]] },
  'Valid input?': { main: [
    [{ node: 'Respond OK (fast)', type: 'main', index: 0 }],
    [{ node: 'Respond Invalid', type: 'main', index: 0 }],
  ] },
  // After responding, keep processing in the background.
  'Respond OK (fast)': { main: [[{ node: 'Process?', type: 'main', index: 0 }]] },
  'Process?': { main: [
    [{ node: 'AI Enrich + Score', type: 'main', index: 0 }],
    [],
  ] },
  'AI Enrich + Score': { main: [[{ node: 'Parse AI', type: 'main', index: 0 }]] },
  'Parse AI': { main: [[{ node: 'Ensure Sheet Tab', type: 'main', index: 0 }]] },
  'Ensure Sheet Tab': { main: [[{ node: 'Set Headers', type: 'main', index: 0 }]] },
  'Set Headers': { main: [[{ node: 'Append Lead', type: 'main', index: 0 }]] },
  'Append Lead': { main: [[{ node: 'Email Homeowner', type: 'main', index: 0 }]] },
  'Email Homeowner': { main: [[{ node: 'Slack Alert', type: 'main', index: 0 }]] },
};

// 'Ensure Sheet Tab' (addSheet) returns 400 once the tab exists — that's expected,
// so don't retry it; retries added ~4.5s/run and risked the webhook response timeout.
const tabNode = nodes.find((n) => n.name === 'Ensure Sheet Tab');
if (tabNode) { tabNode.retryOnFail = false; delete tabNode.maxTries; delete tabNode.waitBetweenTries; }

const workflow = {
  name: 'Lead Capture → Enrich → Sheet + Follow-up (Northwind)',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: '660Xkpo164VSNTDZ' },
};

const out = path.join(__dirname, 'lead-capture.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
