// Assembles email-triage.workflow.json — AI Email Triage + Draft Replies (Gmail/IMAP).
// Run: node build.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const prepareCode = read('prepare-triage.js');
const parseCode = read('parse-triage.js');

const GEMINI = { id: '0eINQFptxG4T1uH7', name: 'epic catch api' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
const IMAP = { id: 'H4ZBCIAEow9jq3rg', name: 'Gmail IMAP - Northwind' };
const CHANNEL = 'C0BDSV5RB5G'; // #chatbot-automation (reused)

const FACTS = 'Repairs carry an $89 diagnostic fee (waived for Care Club members; applied to the repair if approved). '
  + 'New-install estimates (e.g. furnace or AC replacement) are free with a written quote. '
  + 'Hours are Monday-Saturday 7am-7pm, plus 24/7 emergency service. Service area is the Greater Portland metro. '
  + 'The Care Club maintenance plan is $19/month. Main phone: (555) 010-4729. Services: HVAC, plumbing, electrical.';

const pos = (x, y) => [x, y];
const codeNode = (id, name, code, x, mode) => ({
  parameters: mode ? { mode, jsCode: code } : { jsCode: code },
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x, 300),
});

const nodes = [
  {
    parameters: { mailbox: 'INBOX', postProcessAction: 'read', format: 'simple', options: {} },
    id: 'n-imap', name: 'Email Trigger (IMAP)', type: 'n8n-nodes-base.emailReadImap', typeVersion: 2,
    position: pos(-240, 300), credentials: { imap: IMAP },
  },
  {
    parameters: { assignments: { assignments: [
      { id: 'c1', name: 'companyName', value: 'Northwind Home Services', type: 'string' },
      { id: 'c2', name: 'phone', value: '(555) 010-4729', type: 'string' },
      { id: 'c3', name: 'chatModel', value: 'gemini-2.5-flash', type: 'string' },
      { id: 'c4', name: 'channel', value: CHANNEL, type: 'string' },
      { id: 'c5', name: 'facts', value: FACTS, type: 'string' },
      { id: 'c6', name: 'maxAgeHours', value: 72, type: 'number' },
    ] }, options: {} },
    id: 'n-config', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-20, 300),
  },
  codeNode('n-prep', 'Prepare Triage', prepareCode, 200),
  {
    parameters: {
      method: 'POST',
      url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.chatModel + ':generateContent' }}",
      authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.geminiBody }}',
      options: { response: { response: { neverError: false } } },
    },
    id: 'n-ai', name: 'AI Triage + Draft', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(420, 300),
    retryOnFail: true, maxTries: 3, waitBetweenTries: 1500, onError: 'continueRegularOutput',
    credentials: { googlePalmApi: GEMINI },
  },
  codeNode('n-parse', 'Parse Triage', parseCode, 640, 'runOnceForEachItem'),
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'c', leftValue: '={{ $json.needsReply }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      }, options: {},
    },
    id: 'n-if', name: 'Needs reply?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(860, 300),
  },
  {
    parameters: {
      resource: 'message', operation: 'post', select: 'channel',
      channelId: { __rl: true, value: "={{ $('Config').first().json.channel }}", mode: 'id' },
      text: '={{ $json.slackText }}', otherOptions: {},
    },
    id: 'n-slack', name: 'Post Draft to Slack', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(1080, 200),
    onError: 'continueRegularOutput', credentials: { slackApi: SLACK },
  },
];

const connections = {
  'Email Trigger (IMAP)': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Prepare Triage', type: 'main', index: 0 }]] },
  'Prepare Triage': { main: [[{ node: 'AI Triage + Draft', type: 'main', index: 0 }]] },
  'AI Triage + Draft': { main: [[{ node: 'Parse Triage', type: 'main', index: 0 }]] },
  'Parse Triage': { main: [[{ node: 'Needs reply?', type: 'main', index: 0 }]] },
  'Needs reply?': { main: [[{ node: 'Post Draft to Slack', type: 'main', index: 0 }], []] },
};

const workflow = {
  name: 'AI Email Triage + Draft Replies (Northwind)',
  nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: '660Xkpo164VSNTDZ' },
};

const out = path.join(__dirname, 'email-triage.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
