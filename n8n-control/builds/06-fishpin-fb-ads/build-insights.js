// Assembles fishpin-insights.workflow.json — hourly scan for posts that are
// 24h old and still unmeasured. A 24h Wait node does not survive an n8n
// restart, so this runs as its own schedule-triggered workflow instead of a
// long Wait tacked onto the main publish flow.
//
// Libs are inlined ahead of each glue file, same mechanism as build.js: each
// lib's own `module.exports =` line is guarded by `typeof module !==
// 'undefined'`, which is false in the n8n Code sandbox, so the export itself
// is already inert there — but the `lib()` helper below still neutralizes it
// (`module.exports =` -> `void `) rather than relying on that guard alone.
// `void {...}` is a valid no-op expression statement under either of this
// repo's two guard styles (single-line or block), survives a multi-line
// export object without leaving a dangling fragment, and never leaves the
// literal substring `module.exports` in a Code node body for the
// sandbox-safety assertion to (correctly) flag. See build.js's header for
// the full rationale (a line-filter that drops lines matching
// /module\.exports/ is brace-unsafe for a multi-line export object).
// Run: node build-insights.js
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const lib = (n) => read(path.join('lib', n)).replace(/module\.exports\s*=/g, 'void ');
const glue = (n) => read(path.join('nodes', n));
const code = (libs, g) => libs.map(lib).join('\n\n') + '\n\n' + glue(g);

const SHEETS = { id: 'AYzUUEYWUCPKxHFI', name: 'Google Sheets - Content Log' };
const SLACK = { id: 'DnfgaCSu303JPlI3', name: 'Slack - n8n Bot' };
// Created by the owner after the Meta setup; see README section "Facebook token".
const FB = { id: 'HFWwLB58m3JWzduP', name: 'FB Page - FishPin' };

const ERROR_WF = '660Xkpo164VSNTDZ';
const SHEET_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const pos = (x, y) => [x, y];
const sheetUrl = (s) => "={{ '" + SHEET_BASE + "/' + $('Config').first().json.sheetId + '" + s + "' }}";

const http = (id, name, params, x, y, cred) => ({
  parameters: Object.assign({ authentication: 'predefinedCredentialType' }, params),
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x, y),
  retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueRegularOutput', credentials: cred,
});

// posted_at and the 24h cutoff are Philippine local time everywhere in this
// build, and n8n falls back to the INSTANCE timezone (UTC on a default VPS
// install) when a workflow does not set one. See build.js for the full note.
const TZ = 'Asia/Manila';

const nodes = [
  { parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] }, timezone: TZ },
    id: 'i-sched', name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(-400, 300) },
  { parameters: { assignments: { assignments: [
      { id: 'i1', name: 'sheetId', value: '1tdud2e5BKy7IQ7wpYy8Iavl_hOK8vUBrUs1oYj1Cp3E', type: 'string' },
      { id: 'i2', name: 'queueTab', value: 'Queue', type: 'string' },
      { id: 'i3', name: 'graphVersion', value: 'v21.0', type: 'string' },
      { id: 'i4', name: 'opsChannel', value: 'C0BDSV5RB5G', type: 'string' },
      { id: 'i5', name: 'insightsDelayHours', value: 24, type: 'number' },
    ] }, options: {} },
    id: 'i-cfg', name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: pos(-180, 300) },
  http('i-read', 'Read Queue', {
    method: 'GET', url: sheetUrl("/values/' + $('Config').first().json.queueTab + '!A1:P1000"),
    nodeCredentialType: 'googleApi', options: {},
  }, 40, 300, { googleApi: SHEETS }),
  { parameters: { jsCode: code(['sheet-rules.js'], 'select-due.js') },
    id: 'i-due', name: 'Select Due', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(260, 300) },
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: 'c', leftValue: '={{ $json.any }}', rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    id: 'i-if', name: 'Any Due?', type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(480, 300) },
  { parameters: { jsCode: 'return items;' },
    id: 'i-split', name: 'Split Posts', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(700, 220) },
  http('i-ins', 'Get Insights', {
    method: 'GET',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $json.row.fb_post_id + '/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total' }}",
    nodeCredentialType: 'facebookGraphApi', options: {},
  }, 920, 220, { facebookGraphApi: FB }),
  // Split Posts fans out to one item per due row. $('Split Posts').first()
  // always returns index 0 of that node's output regardless of which item
  // Get Engagement is currently processing — it bypasses pairedItem
  // matching — so with N due rows it would fetch row 1's engagement N
  // times and rows 2..N would never get measured. Get Engagement runs 1:1
  // and in order against Split Posts' output, so $itemIndex deterministic
  // index-alignment is correct here without depending on pairedItem
  // propagation through the HTTP node.
  http('i-eng', 'Get Engagement', {
    method: 'GET',
    url: "={{ 'https://graph.facebook.com/' + $('Config').first().json.graphVersion + '/' + $('Split Posts').all()[$itemIndex].json.row.fb_post_id + '?fields=comments.summary(true),shares,reactions.summary(true)' }}",
    nodeCredentialType: 'facebookGraphApi', options: {},
  }, 1140, 220, { facebookGraphApi: FB }),
  { parameters: { jsCode: code(['sheet-rules.js'], 'map-metrics.js') },
    id: 'i-map', name: 'Map Metrics', type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(1360, 220) },
  // G = status, M:P = likes, comments, shares, reach. Writing G:P as one range
  // would blank columns H-L (scheduled_for, caption, image_url, fb_post_id,
  // posted_at), destroying the record of what was actually published.
  http('i-upd', 'Update Row', {
    method: 'POST', url: sheetUrl('/values:batchUpdate'),
    nodeCredentialType: 'googleApi', sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ valueInputOption: 'RAW', data: [ { range: $('Config').first().json.queueTab + '!G' + $json._rowNumber, values: [[ $json.status ]] }, { range: $('Config').first().json.queueTab + '!M' + $json._rowNumber + ':P' + $json._rowNumber, values: [[ $json.likes, $json.comments, $json.shares, $json.reach ]] } ] }) }}",
    options: {},
  }, 1580, 220, { googleApi: SHEETS }),
  // Notify Digest's only predecessor is Update Row, an HTTP node whose output
  // is the Sheets batchUpdate RESPONSE ({spreadsheetId, totalUpdatedRows, ...})
  // — it has no id/reach/likes/comments/shares at all, so reading $json here
  // rendered every field blank and the entire user-facing output of this
  // workflow was an empty line. The numbers live on Map Metrics, and Map
  // Metrics -> Update Row -> Notify Digest is 1:1 and order-preserving, so
  // $itemIndex index-alignment is the same pattern Get Engagement already uses
  // against Split Posts. (.first() would be the collapse-to-row-1 bug again.)
  { parameters: { select: 'channel',
      channelId: { __rl: true, value: "={{ $('Config').first().json.opsChannel }}", mode: 'id' },
      text: "=:bar_chart: FishPin 24h numbers for `{{ $('Map Metrics').all()[$itemIndex].json.id }}`: "
        + "reach {{ $('Map Metrics').all()[$itemIndex].json.reach }}, "
        + "likes {{ $('Map Metrics').all()[$itemIndex].json.likes }}, "
        + "comments {{ $('Map Metrics').all()[$itemIndex].json.comments }}, "
        + "shares {{ $('Map Metrics').all()[$itemIndex].json.shares }}",
      otherOptions: {} },
    id: 'i-slack', name: 'Notify Digest', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: pos(1800, 220),
    onError: 'continueRegularOutput', credentials: { slackApi: SLACK } },
];

const connections = {
  'Schedule Trigger': { main: [[{ node: 'Config', type: 'main', index: 0 }]] },
  'Config': { main: [[{ node: 'Read Queue', type: 'main', index: 0 }]] },
  'Read Queue': { main: [[{ node: 'Select Due', type: 'main', index: 0 }]] },
  'Select Due': { main: [[{ node: 'Any Due?', type: 'main', index: 0 }]] },
  'Any Due?': { main: [[{ node: 'Split Posts', type: 'main', index: 0 }], []] },
  'Split Posts': { main: [[{ node: 'Get Insights', type: 'main', index: 0 }]] },
  'Get Insights': { main: [[{ node: 'Get Engagement', type: 'main', index: 0 }]] },
  'Get Engagement': { main: [[{ node: 'Map Metrics', type: 'main', index: 0 }]] },
  'Map Metrics': { main: [[{ node: 'Update Row', type: 'main', index: 0 }]] },
  'Update Row': { main: [[{ node: 'Notify Digest', type: 'main', index: 0 }]] },
};

const workflow = {
  name: 'FishPin Ad Insights (24h)', nodes, connections,
  settings: { executionOrder: 'v1', errorWorkflow: ERROR_WF, timezone: TZ },
};
const out = path.join(__dirname, 'fishpin-insights.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes)');
