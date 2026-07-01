// Assembles invoice-extraction.workflow.json — Upload → Gemini Vision → validate
// → DEDUP check → Airtable. Notifications (WhatsApp) added in phase 2.
// Run: node build.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const validateCode = read('validate-input.js');
const mapCode = read('map-validate.js');
const checkDupCode = read('check-dup.js');

const GEMINI = { id: '0eINQFptxG4T1uH7', name: 'epic catch api' };
const AIRTABLE = { id: 'sSLblszJWxpUr8fl', name: 'Airtable - Northwind' };
const BASE_ID = 'appug80MzHJWdeZNU';
const TABLE_ID = 'tbldFhqjuFOPJsD7G';
const WEBHOOK_PATH = 'invoice-northwind';

const pos = (x, y) => [x, y];
const codeNode = (id, name, code, x, y = 300) => ({ parameters: { jsCode: code }, id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, y) });
const respond = (id, name, bodyExpr, x, y, code) => ({ parameters: { respondWith: 'json', responseBody: bodyExpr, options: code ? { responseCode: code } : {} }, id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos(x, y) });
const airtableTable = "={{ 'https://api.airtable.com/v0/' + $('Config').first().json.baseId + '/' + $('Config').first().json.tableId }}";

const nodes = [
  { parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    id: 'n-wh', name: 'Upload Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(-320, 300), webhookId: 'invoice-northwind-hook' },
  { parameters: { assignments: { assignments: [
      { id: 'c1', name: 'companyName', value: 'Northwind Home Services', type: 'string' },
      { id: 'c2', name: 'chatModel', value: 'gemini-2.5-flash', type: 'string' },
      { id: 'c3', name: 'baseId', value: BASE_ID, type: 'string' },
      { id: 'c4', name: 'tableId', value: TABLE_ID, type: 'string' },
      { id: 'c6', name: 'confidenceThreshold', value: 70, type: 'number' },
      { id: 'c7', name: 'mathTolerance', value: 0.02, type: 'number' },
    ] }, options: {} },
    id: 'n-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-120, 300) },
  codeNode('n-val', 'Validate Input', validateCode, 80),
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'c', leftValue: '={{ $json.valid }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    id: 'n-if', name: 'Valid file?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(300, 300) },
  { parameters: {
      method: 'POST',
      url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.chatModel + ':generateContent' }}",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
      options: { response: { response: { neverError: false } }, timeout: 60000 },
    }, id: 'n-ai', name: 'Gemini Vision Extract', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(520, 200),
    retryOnFail: true, maxTries: 2, waitBetweenTries: 2000, onError: 'continueRegularOutput', credentials: { googlePalmApi: GEMINI } },
  codeNode('n-map', 'Map & Validate', mapCode, 740, 200),
  // Dedup lookup: does a record with this vendor + invoice# already exist?
  { parameters: {
      method: 'GET', url: airtableTable,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
      sendQuery: true, queryParameters: { parameters: [
        { name: 'filterByFormula', value: '={{ $json.dedupFormula }}' },
        { name: 'maxRecords', value: '1' },
      ] },
      options: { response: { response: { neverError: false } } },
    }, id: 'n-dq', name: 'Dedup Lookup', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(960, 200),
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1000, onError: 'continueRegularOutput', credentials: { airtableTokenApi: AIRTABLE } },
  codeNode('n-chk', 'Check Dup', checkDupCode, 1180, 200),
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'c', leftValue: '={{ $json.duplicate }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    id: 'n-ifdup', name: 'Duplicate?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(1400, 200) },
  { parameters: {
      method: 'POST', url: airtableTable,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
      sendBody: true, specifyBody: 'json', jsonBody: "={{ $('Map & Validate').first().json.airtableBody }}",
      options: { response: { response: { neverError: false } } },
    }, id: 'n-at', name: 'Create Airtable Record', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(1620, 120),
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1500, onError: 'continueRegularOutput', credentials: { airtableTokenApi: AIRTABLE } },
  respond('n-ok', 'Respond Logged',
    "={{ JSON.stringify({ ok: true, duplicate: false, status: $('Check Dup').first().json.status, vendor: $('Check Dup').first().json.vendor, invoiceNumber: $('Check Dup').first().json.invoiceNumber, total: $('Check Dup').first().json.total, currency: $('Check Dup').first().json.currency, confidence: $('Check Dup').first().json.confidence, reasons: $('Check Dup').first().json.reasons, message: $('Check Dup').first().json.message }) }}",
    1840, 120),
  respond('n-dup', 'Respond Duplicate',
    "={{ JSON.stringify({ ok: true, duplicate: true, status: 'Duplicate', vendor: $('Check Dup').first().json.vendor, invoiceNumber: $('Check Dup').first().json.invoiceNumber, message: $('Check Dup').first().json.message }) }}",
    1620, 300),
  respond('n-bad', 'Respond Invalid', "={{ JSON.stringify({ ok: false, error: $('Validate Input').first().json.reason }) }}", 520, 420, 422),
];

const connections = {
  'Upload Webhook': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Validate Input', type: 'main', index: 0 }]] },
  'Validate Input': { main: [[{ node: 'Valid file?', type: 'main', index: 0 }]] },
  'Valid file?': { main: [[{ node: 'Gemini Vision Extract', type: 'main', index: 0 }], [{ node: 'Respond Invalid', type: 'main', index: 0 }]] },
  'Gemini Vision Extract': { main: [[{ node: 'Map & Validate', type: 'main', index: 0 }]] },
  'Map & Validate': { main: [[{ node: 'Dedup Lookup', type: 'main', index: 0 }]] },
  'Dedup Lookup': { main: [[{ node: 'Check Dup', type: 'main', index: 0 }]] },
  'Check Dup': { main: [[{ node: 'Duplicate?', type: 'main', index: 0 }]] },
  'Duplicate?': { main: [[{ node: 'Respond Duplicate', type: 'main', index: 0 }], [{ node: 'Create Airtable Record', type: 'main', index: 0 }]] },
  'Create Airtable Record': { main: [[{ node: 'Respond Logged', type: 'main', index: 0 }]] },
};

const workflow = { name: 'Invoice Extraction → Airtable (Northwind)', nodes, connections, settings: { executionOrder: 'v1', errorWorkflow: '660Xkpo164VSNTDZ' } };
const out = path.join(__dirname, 'invoice-extraction.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
