// Throwaway spike. Run: node spike/build-spike.js
const fs = require('fs');
const path = require('path');

const GEMINI = { googlePalmApi: { id: 'S0qfsjLzQfKC04iG', name: 'Gemini - Brand Variations' } };
const SLACK = { slackApi: { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' } };
const G = 'https://generativelanguage.googleapis.com/v1beta/';
const CH = 'C0C1WS8PAAJ';

let x = 0;
const at = () => [(x += 220), 300];
const code = (name, jsCode) => ({ parameters: { jsCode }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: at() });
const http = (name, p, cred, extra = {}) => Object.assign({
  parameters: Object.assign({ options: { response: { response: { neverError: true } } } }, p),
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at(),
}, cred ? { credentials: cred } : {}, extra);
const cred = (c) => ({ authentication: 'predefinedCredentialType', nodeCredentialType: Object.keys(c)[0] });

const nodes = [
  { parameters: { httpMethod: 'POST', path: 'fishpin-video-spike', responseMode: 'onReceived', options: {} },
    name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: at(), webhookId: 'fishpin-video-spike' },

  // ---- Veo branch
  http('Hook Still', Object.assign(cred(GEMINI), { method: 'POST', url: G + 'models/gemini-2.5-flash-image:generateContent',
    sendBody: true, specifyBody: 'json', jsonBody: JSON.stringify({
      contents: [{ parts: [{ text: 'Documentary photograph, vertical 9:16: a Filipino fisherman in his 40s on a wooden bangka with outriggers at dusk, calm sea, fog rolling in. Deep navy and amber colour grade. No text, no logo.' }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } } }) }), GEMINI),
  code('Extract Still', "const p=($json.candidates||[])[0]?.content?.parts||[];const d=(p.find(x=>x.inlineData||x.inline_data)||{});const i=d.inlineData||d.inline_data||{};return [{json:{mime:i.mimeType||i.mime_type||'image/png',b64:i.data||'',bytes:Buffer.from(i.data||'','base64').length}}];"),
  http('Veo Start', Object.assign(cred(GEMINI), { method: 'POST', url: G + 'models/veo-3.1-lite-generate-preview:predictLongRunning',
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ instances: [{ prompt: 'The fog slowly rolls across the calm sea toward the bangka; the fisherman looks up, uneasy. Slow push-in. No text.', image: { bytesBase64Encoded: $json.b64, mimeType: $json.mime } }], parameters: { aspectRatio: '9:16', resolution: '1080p', durationSeconds: 6, personGeneration: 'allow_adult' } }) }}" }), GEMINI),
  { parameters: { amount: 15, unit: 'seconds' }, name: 'Wait 15s', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: at(), webhookId: 'fishpin-video-spike-wait' },
  http('Veo Poll', Object.assign(cred(GEMINI), { method: 'GET', url: "={{ '" + G + "' + $('Veo Start').first().json.name }}" }), GEMINI),
  code('Poll Guard', "const start=$('Veo Start').first().json;if(!start.name) throw new Error('Veo Start failed: ' + JSON.stringify(start).slice(0,400));\nif ($json.done === true) return [{json:{done:true, uri: $json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || '', raw: $json}}];\nif ($runIndex >= 32) throw new Error('Veo did not finish in 8 minutes: ' + JSON.stringify($json).slice(0,500));\nreturn [{json:{done:false}}];"),
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: 'd', leftValue: '={{ $json.done }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    name: 'Veo Done?', type: 'n8n-nodes-base.if', typeVersion: 2, position: at() },
  http('Veo Download', Object.assign(cred(GEMINI), { method: 'GET', url: '={{ $json.uri }}',
    options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data', neverError: true } } } }), GEMINI),
  code('Video Meta', "const b=$input.first().binary?.data;const buf=b?await this.helpers.getBinaryDataBuffer(0,'data'):Buffer.alloc(0);return [{json:{filename:'spike-hook.mp4',bytes:buf.length,mime:b?.mimeType||''},binary:$input.first().binary}];"),
  http('Slack Upload URL', Object.assign(cred(SLACK), { method: 'GET', url: 'https://slack.com/api/files.getUploadURLExternal',
    sendQuery: true, queryParameters: { parameters: [{ name: 'filename', value: '={{ $json.filename }}' }, { name: 'length', value: '={{ $json.bytes }}' }] } }), SLACK),
  code('Reattach Video', "const m=$('Video Meta').first();return [{json:{...m.json,upload_url:$json.upload_url,file_id:$json.file_id,ok:$json.ok,err:$json.error||''},binary:m.binary}];"),
  http('Slack Push Bytes', { method: 'POST', url: '={{ $json.upload_url }}', sendBody: true, contentType: 'binaryData', inputDataFieldName: 'data' }),
  http('Slack Complete', Object.assign(cred(SLACK), { method: 'POST', url: 'https://slack.com/api/files.completeUploadExternal',
    sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ files: [{ id: $('Reattach Video').first().json.file_id, title: 'Veo spike hook' }] }) }}" }), SLACK),
  { parameters: { amount: 5, unit: 'seconds' }, name: 'Wait 5s', type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: at(), webhookId: 'fishpin-video-spike-wait5' },
  http('Slack Post Video', Object.assign(cred(SLACK), { method: 'POST', url: 'https://slack.com/api/chat.postMessage',
    sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ channel: '" + CH + "', text: 'SPIKE video preview: ' + ($('Slack Complete').first().json.files?.[0]?.permalink || '(no permalink)') }) }}" }), SLACK),

  // ---- TTS branch
  code('Voices', "const line='Nawala ang signal sa laot, gabi na, at hindi mahanap yung daan pauwi? Sa FishPin, alam mo pa rin kung nasaan ka.';return ['Gacrux','Algenib','Achird'].map(v=>({json:{voice:v,text:'Say this calmly and warmly, like a kuya on the pier talking to fellow fishermen: '+line}}));"),
  http('TTS', Object.assign(cred(GEMINI), { method: 'POST', url: G + 'models/gemini-3.1-flash-tts-preview:generateContent',
    sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ contents: [{ parts: [{ text: $json.text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: $json.voice } } } } }) }}" }), GEMINI),
  code('PCM to WAV', "const voices=$('Voices').all();const out=[];for(let i=0;i<items.length;i++){const part=items[i].json.candidates?.[0]?.content?.parts?.[0];if(!part||!part.inlineData){out.push({json:{voice:voices[i].json.voice,ok:false,raw:JSON.stringify(items[i].json).slice(0,400)}});continue;}const rate=+((part.inlineData.mimeType||'').match(/rate=(\\d+)/)||[])[1]||24000;const pcm=Buffer.from(part.inlineData.data,'base64');const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);const wav=Buffer.concat([h,pcm]);out.push({json:{voice:voices[i].json.voice,ok:true,mime:part.inlineData.mimeType,bytes:wav.length,seconds:pcm.length/(rate*2)},binary:{data:await this.helpers.prepareBinaryData(wav,'voice-'+voices[i].json.voice+'.wav','audio/wav')}});}return out;"),
];

const c = (a, b, i = 0) => ({ node: b, type: 'main', index: i });
const connections = {
  Webhook: { main: [[c(0, 'Hook Still'), c(0, 'Voices')]] },
  'Hook Still': { main: [[c(0, 'Extract Still')]] },
  'Extract Still': { main: [[c(0, 'Veo Start')]] },
  'Veo Start': { main: [[c(0, 'Wait 15s')]] },
  'Wait 15s': { main: [[c(0, 'Veo Poll')]] },
  'Veo Poll': { main: [[c(0, 'Poll Guard')]] },
  'Poll Guard': { main: [[c(0, 'Veo Done?')]] },
  'Veo Done?': { main: [[c(0, 'Veo Download')], [c(0, 'Wait 15s')]] },
  'Veo Download': { main: [[c(0, 'Video Meta')]] },
  'Video Meta': { main: [[c(0, 'Slack Upload URL')]] },
  'Slack Upload URL': { main: [[c(0, 'Reattach Video')]] },
  'Reattach Video': { main: [[c(0, 'Slack Push Bytes')]] },
  'Slack Push Bytes': { main: [[c(0, 'Slack Complete')]] },
  'Slack Complete': { main: [[c(0, 'Wait 5s')]] },
  'Wait 5s': { main: [[c(0, 'Slack Post Video')]] },
  Voices: { main: [[c(0, 'TTS')]] },
  TTS: { main: [[c(0, 'PCM to WAV')]] },
};

const wf = { name: 'SPIKE FishPin video (delete after)', nodes, connections, settings: { executionOrder: 'v1' } };
fs.writeFileSync(path.join(__dirname, 'spike.workflow.json'), JSON.stringify(wf, null, 2));
console.log('wrote spike.workflow.json (' + nodes.length + ' nodes');
