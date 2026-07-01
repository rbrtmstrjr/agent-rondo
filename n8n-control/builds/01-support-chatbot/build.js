// Assembles support-chatbot.workflow.json from the *.js code-node bodies + node defs.
// Run: node build.js   (writes ./support-chatbot.workflow.json)
//
// v2 engine: warm reasoning persona + rolling-summary memory + contextual hand-off.
//   Webhook -> Config -> Prepare -> Batch Embed -> Retrieve -> Gemini Chat -> Decide
//           -> Log -> Escalate? -> [Notify] -> Respond
//           -> Memory Maintenance -> Needs Summary? -> Summarize -> Apply Summary
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const prepareCode = read('prepare.js');
const retrieveCode = read('retrieve.js');
const decideCode = read('decide.js');
const memoryMaintenanceCode = read('memory-maintenance.js');
const applySummaryCode = read('apply-summary.js');

const GEMINI_CRED = { id: '0eINQFptxG4T1uH7', name: 'epic catch api' };
const SLACK_CRED = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
const LOG_CHANNEL = 'C0BDSV5RB5G';      // #chatbot-automation
const ESCALATE_CHANNEL = 'C0BDSV5RB5G';
const WEBHOOK_PATH = 'chat-northwind';

const pos = (x, y) => [x, y];
const codeNode = (id, name, code, x) => ({
  parameters: { jsCode: code },
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, 300),
});
const slackNode = (id, name, chanExpr, textExpr, x, y) => ({
  parameters: {
    resource: 'message', operation: 'post', select: 'channel',
    channelId: { __rl: true, value: chanExpr, mode: 'id' },
    text: textExpr, otherOptions: {},
  },
  id, name, type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(x, y),
  onError: 'continueRegularOutput', credentials: { slackApi: SLACK_CRED },
});
const geminiHttp = (id, name, urlExpr, bodyExpr, x) => ({
  parameters: {
    method: 'POST', url: urlExpr,
    authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
    sendBody: true, specifyBody: 'json', jsonBody: bodyExpr,
    options: { response: { response: { neverError: false } } },
  },
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, 300),
  retryOnFail: true, maxTries: 3, waitBetweenTries: 1500,
  onError: 'continueRegularOutput', credentials: { googlePalmApi: GEMINI_CRED },
});

const nodes = [
  {
    parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    id: 'node-webhook', name: 'Chat Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: pos(-200, 300), webhookId: 'chat-northwind-hook',
  },
  {
    parameters: {
      assignments: { assignments: [
        { id: 'c1', name: 'companyName', value: 'Northwind Home Services', type: 'string' },
        { id: 'c2', name: 'supportContact', value: '(555) 010-4729', type: 'string' },
        { id: 'c3', name: 'embedModel', value: 'gemini-embedding-001', type: 'string' },
        { id: 'c4', name: 'chatModel', value: 'gemini-2.5-flash', type: 'string' },
        { id: 'c5', name: 'minScore', value: 0.45, type: 'number' },
        { id: 'c6', name: 'topK', value: 5, type: 'number' },
        { id: 'c11', name: 'chatTemperature', value: 0.55, type: 'number' },
        { id: 'c7', name: 'memoryMaxTurns', value: 24, type: 'number' },
        { id: 'c12', name: 'memorySummarizeAt', value: 16, type: 'number' },
        { id: 'c13', name: 'memoryKeep', value: 12, type: 'number' },
        { id: 'c10', name: 'memoryTtlMin', value: 180, type: 'number' },
        { id: 'c8', name: 'logChannel', value: LOG_CHANNEL, type: 'string' },
        { id: 'c9', name: 'escalateChannel', value: ESCALATE_CHANNEL, type: 'string' },
      ] }, options: {},
    },
    id: 'node-config', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(20, 300),
  },
  codeNode('node-prepare', 'Prepare', prepareCode, 240),
  geminiHttp('node-embed', 'Batch Embed',
    "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.embedModel + ':batchEmbedContents' }}",
    '={{ $json.embedBody }}', 460),
  codeNode('node-retrieve', 'Retrieve', retrieveCode, 680),
  geminiHttp('node-chat', 'Gemini Chat',
    "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.chatModel + ':generateContent' }}",
    '={{ $json.chatBody }}', 900),
  codeNode('node-decide', 'Decide', decideCode, 1120),
  slackNode('node-log', 'Log to Slack',
    "={{ $('Config').first().json.logChannel }}",
    '={{ "🤖 *Northwind Chatbot* | session `" + $(\'Decide\').first().json.sessionId + "` | score " + $(\'Decide\').first().json.score + ($(\'Decide\').first().json.escalate ? " | ⚠️ ESCALATED" : "") + "\\n*Q:* " + $(\'Decide\').first().json.message + "\\n*A:* " + $(\'Decide\').first().json.reply }}',
    1340, 300),
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'cond1', leftValue: '={{ $(\'Decide\').first().json.escalate }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      }, options: {},
    },
    id: 'node-if', name: 'Escalate?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(1560, 300),
  },
  slackNode('node-escalate', 'Notify Support (Human)',
    "={{ $('Config').first().json.escalateChannel }}",
    '={{ "🚨 *Human handoff needed* — please follow up with this customer.\\n*Session:* `" + $(\'Decide\').first().json.sessionId + "`\\n*Customer asked:* " + $(\'Decide\').first().json.message + "\\n*Top match score:* " + $(\'Decide\').first().json.score }}',
    1780, 180),
  {
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify({ reply: $(\'Decide\').first().json.reply, escalate: $(\'Decide\').first().json.escalate, sources: $(\'Decide\').first().json.sources }) }}',
      options: {},
    },
    id: 'node-respond', name: 'Respond to Widget', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos(2000, 300),
  },
  // ---- Post-response memory maintenance (runs after the user already got the reply) ----
  codeNode('node-memmaint', 'Memory Maintenance', memoryMaintenanceCode, 2220),
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'condS', leftValue: '={{ $json.skip }}', rightValue: false, operator: { type: 'boolean', operation: 'false', singleValue: true } }],
        combinator: 'and',
      }, options: {},
    },
    id: 'node-needsum', name: 'Needs Summary?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(2440, 300),
  },
  geminiHttp('node-summarize', 'Summarize Memory',
    "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.chatModel + ':generateContent' }}",
    '={{ $json.summaryBody }}', 2660),
  codeNode('node-applysum', 'Apply Summary', applySummaryCode, 2880),
];

const connections = {
  'Chat Webhook': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Prepare', type: 'main', index: 0 }]] },
  'Prepare': { main: [[{ node: 'Batch Embed', type: 'main', index: 0 }]] },
  'Batch Embed': { main: [[{ node: 'Retrieve', type: 'main', index: 0 }]] },
  'Retrieve': { main: [[{ node: 'Gemini Chat', type: 'main', index: 0 }]] },
  'Gemini Chat': { main: [[{ node: 'Decide', type: 'main', index: 0 }]] },
  'Decide': { main: [[{ node: 'Log to Slack', type: 'main', index: 0 }]] },
  'Log to Slack': { main: [[{ node: 'Escalate?', type: 'main', index: 0 }]] },
  'Escalate?': { main: [
    [{ node: 'Notify Support (Human)', type: 'main', index: 0 }],
    [{ node: 'Respond to Widget', type: 'main', index: 0 }],
  ] },
  'Notify Support (Human)': { main: [[{ node: 'Respond to Widget', type: 'main', index: 0 }]] },
  'Respond to Widget': { main: [[{ node: 'Memory Maintenance', type: 'main', index: 0 }]] },
  'Memory Maintenance': { main: [[{ node: 'Needs Summary?', type: 'main', index: 0 }]] },
  'Needs Summary?': { main: [
    [{ node: 'Summarize Memory', type: 'main', index: 0 }],
    [],
  ] },
  'Summarize Memory': { main: [[{ node: 'Apply Summary', type: 'main', index: 0 }]] },
};

const workflow = {
  name: 'AI Support Chatbot (RAG) — Northwind Demo',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: '660Xkpo164VSNTDZ' },
};

const out = path.join(__dirname, 'support-chatbot.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
