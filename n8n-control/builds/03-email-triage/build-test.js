// Throwaway tester: same triage brain, but a Webhook trigger fed a sample email,
// so we can verify classify+draft+Slack without depending on the IMAP trigger.
const fs = require('fs');
const path = require('path');

const FACTS = 'Repairs carry an $89 diagnostic fee (waived for Care Club members; applied to the repair if approved). '
  + 'New-install estimates (e.g. furnace or AC replacement) are free with a written quote. '
  + 'Hours are Monday-Saturday 7am-7pm, plus 24/7 emergency service. Service area is the Greater Portland metro. '
  + 'The Care Club maintenance plan is $19/month. Main phone: (555) 010-4729. Services: HVAC, plumbing, electrical.';

const prep = `
const cfg = $('Config').first().json;
const b = ($('Test Webhook').first().json.body) || {};
const from = String(b.from || 'someone@example.com');
const subject = String(b.subject || '(no subject)');
const body = String(b.body || '');
const sys = 'You are the email assistant for ' + cfg.companyName + ', a home-services company (HVAC, plumbing, electrical) serving the Greater Portland area. '
  + 'Triage this incoming email and return JSON. category is one of: "Lead reply","New inquiry","Booking/scheduling","Question","Not interested","Spam/Promo","Other". '
  + 'needsReply = true ONLY if a real person (customer, lead, or genuine inquiry) would expect a reply; false for newsletters, promotions, no-reply/automated, receipts or internal notices. '
  + 'summary: 1-2 sentences. sentiment: Positive/Neutral/Negative/Urgent. '
  + 'If needsReply, draftBody = a warm professional reply in the voice of a ' + cfg.companyName + ' rep that moves things forward (answer what you can; invite them to book or call ' + cfg.phone + '). '
  + 'Use these facts and never contradict or invent beyond them: ' + cfg.facts + ' '
  + 'Concise (4-7 sentences), plain text, sign off "The ' + cfg.companyName + ' Team". draftSubject = "Re: " + their subject. If not needsReply, draftSubject and draftBody are empty. reason: one short line.';
const geminiBody = { systemInstruction:{parts:[{text:sys}]}, contents:[{role:'user',parts:[{text:'FROM: '+from+'\\nSUBJECT: '+subject+'\\n\\nBODY:\\n'+body}]}], generationConfig:{ temperature:0.4, responseMimeType:'application/json', responseSchema:{ type:'OBJECT', properties:{ category:{type:'STRING'}, needsReply:{type:'BOOLEAN'}, summary:{type:'STRING'}, sentiment:{type:'STRING'}, draftSubject:{type:'STRING'}, draftBody:{type:'STRING'}, reason:{type:'STRING'} }, required:['category','needsReply','summary','sentiment','draftSubject','draftBody','reason'] } } };
return [{ json: { from, subject, geminiBody } }];
`;

const parse = `
const p = $('Prep Test').first().json;
const chat = $json;
let ai = {}; try { ai = JSON.parse(chat.candidates[0].content.parts.map(x=>x.text||'').join('')); } catch(e){ ai={}; }
const needsReply = ai.needsReply === true && (ai.draftBody||'').trim() !== '';
const slackText = '🧪 *Triage test* · ' + (ai.category||'?') + ' · ' + (ai.sentiment||'?')
  + '\\n*From:* ' + p.from + '\\n*Subject:* ' + p.subject + '\\n*Summary:* ' + (ai.summary||'')
  + (needsReply ? '\\n\\n*Suggested reply:*\\n>>> ' + ai.draftBody : '\\n_No reply needed._');
return [{ json: { needsReply, slackText, reply: ai.draftBody||'', category: ai.category } }];
`;

const pos = (x) => [x, 300];
const nodes = [
  { parameters: { httpMethod:'POST', path:'triage-test', responseMode:'responseNode', options:{} }, id:'w', name:'Test Webhook', type:'n8n-nodes-base.webhook', typeVersion:2, position:[-200,300], webhookId:'triage-test-hook' },
  { parameters: { assignments: { assignments: [
      { id:'c1', name:'companyName', value:'Northwind Home Services', type:'string' },
      { id:'c2', name:'phone', value:'(555) 010-4729', type:'string' },
      { id:'c3', name:'chatModel', value:'gemini-2.5-flash', type:'string' },
      { id:'c5', name:'facts', value:FACTS, type:'string' },
    ] }, options:{} }, id:'cfg', name:'Config', type:'n8n-nodes-base.set', typeVersion:3.4, position:pos(20) },
  { parameters:{ jsCode: prep }, id:'p', name:'Prep Test', type:'n8n-nodes-base.code', typeVersion:2, position:pos(240) },
  { parameters:{ method:'POST', url:"={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $('Config').first().json.chatModel + ':generateContent' }}", authentication:'predefinedCredentialType', nodeCredentialType:'googlePalmApi', sendBody:true, specifyBody:'json', jsonBody:'={{ $json.geminiBody }}', options:{} }, id:'ai', name:'AI Triage + Draft', type:'n8n-nodes-base.httpRequest', typeVersion:4.2, position:pos(460), onError:'continueRegularOutput', credentials:{ googlePalmApi:{ id:'0eINQFptxG4T1uH7', name:'epic catch api' } } },
  { parameters:{ jsCode: parse }, id:'pa', name:'Parse Test', type:'n8n-nodes-base.code', typeVersion:2, position:pos(680) },
  { parameters:{ resource:'message', operation:'post', select:'channel', channelId:{ __rl:true, value:'C0BDSV5RB5G', mode:'id' }, text:'={{ $json.slackText }}', otherOptions:{} }, id:'sl', name:'Slack', type:'n8n-nodes-base.slack', typeVersion:2.3, position:pos(900), onError:'continueRegularOutput', credentials:{ slackApi:{ id:'DnfgaCSu303JPlI3', name:'Slack - n8n Bot' } } },
  { parameters:{ respondWith:'json', responseBody:'={{ JSON.stringify({ category: $json.category, reply: $json.reply }) }}', options:{} }, id:'r', name:'Respond', type:'n8n-nodes-base.respondToWebhook', typeVersion:1.1, position:pos(1120) },
];
const connections = {
  'Test Webhook':{ main:[[{node:'Config',type:'main',index:0}]] },
  'Config':{ main:[[{node:'Prep Test',type:'main',index:0}]] },
  'Prep Test':{ main:[[{node:'AI Triage + Draft',type:'main',index:0}]] },
  'AI Triage + Draft':{ main:[[{node:'Parse Test',type:'main',index:0}]] },
  'Parse Test':{ main:[[{node:'Slack',type:'main',index:0}]] },
  'Slack':{ main:[[{node:'Respond',type:'main',index:0}]] },
};
const wf = { name:'TEMP triage tester', nodes, connections, settings:{ executionOrder:'v1' } };
fs.writeFileSync(path.join(__dirname,'triage-test.workflow.json'), JSON.stringify(wf,null,2), 'utf8');
console.log('wrote triage-test.workflow.json');
