// ============================================================================
// Validate & Prepare — Code node (no credentials). Validates the incoming lead,
// drops spam (honeypot) + duplicates, and builds the Gemini enrich+score request.
// ============================================================================

const cfg = $('Config').first().json;
const wh = $('Lead Webhook').first().json;
const body = (wh && wh.body) ? wh.body : {};

const str = (v) => String(v == null ? '' : v).trim();
const name = str(body.name);
const email = str(body.email);
const phone = str(body.phone);
const zip = str(body.zip);
const service = str(body.service);
const urgency = str(body.urgency);
const message = str(body.message);
const honeypot = str(body.company);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

let valid = true;
let process = true;
let reason = '';

// 1) Spam honeypot — accept silently but do nothing.
if (honeypot) { process = false; reason = 'spam (honeypot)'; }

// 2) Required fields.
if (!name || (!email && !phone)) { valid = false; reason = 'Missing name and a contact method (email or phone).'; }
else if (email && !isEmail(email)) { valid = false; reason = 'Invalid email address.'; }

// 3) Idempotency — ignore identical re-submits within the dedup window.
if (valid && process) {
  try {
    const sd = $getWorkflowStaticData('global');
    sd.seen = sd.seen || {};
    const now = Date.now();
    const windowMs = Number(cfg.dedupMinutes || 10) * 60000;
    for (const k of Object.keys(sd.seen)) { if (now - sd.seen[k] > 3600000) delete sd.seen[k]; }
    const key = (email || phone).toLowerCase() + '|' + message.slice(0, 80).toLowerCase();
    if (sd.seen[key] && now - sd.seen[key] < windowMs) { process = false; reason = 'duplicate submission'; }
    else sd.seen[key] = now;
  } catch (e) { /* dedup is best-effort */ }
}

// Build the AI enrich + score request (structured JSON output).
const sys = 'You are a lead-qualification assistant for ' + cfg.companyName + ', a home-services company '
  + '(HVAC, plumbing, electrical) serving these areas: ' + cfg.serviceAreas + '. '
  + 'Analyze the new lead and return JSON. Guidance: '
  + 'serviceType from the message; '
  + 'urgency = "Emergency" for no heat/cooling, burst or leaking pipes, sewage, sparking outlets, no power, or wording like ASAP/now/emergency; '
  + '"Soon" if they want service within days; "Planning" if just pricing or exploring. '
  + 'inServiceArea = true if the ZIP/city is in the service-area list, false if clearly outside it, true if unknown (give benefit of the doubt). '
  + 'valueBand: "High" = installs/replacements, panel upgrades, repipes, water-heater replacement; "Medium" = repairs; "Low" = questions/minor. '
  + 'leadScore 0-100 weighing urgency, in-area, value, and how complete/serious the request is. '
  + 'temperature: "Hot" if score >= ' + (cfg.hotThreshold || 70) + ', "Warm" if 40-' + ((cfg.hotThreshold || 70) - 1) + ', else "Cold". '
  + 'emailSubject + emailBody: a warm, personal acknowledgment to the homeowner that references their SPECIFIC issue. '
  + 'IF inServiceArea is TRUE: reassure them and set expectations (a specialist will follow up shortly; for anything urgent call ' + cfg.phone + '). '
  + 'IF inServiceArea is FALSE: do NOT promise any visit, follow-up, or specialist call. Instead write a warm, apologetic decline that thanks them, '
  + 'explains that ' + cfg.companyName + ' currently only serves the Greater Portland metro area and is unable to take their job, and wishes them well; '
  + 'you may add ONE line inviting them to call ' + cfg.phone + ' only if they believe their address is actually within Greater Portland. '
  + 'Either way: plain text, 4-6 sentences, no markdown, sign off as the ' + cfg.companyName + ' team. '
  + 'suggestedReply: one short line for the human rep. If inServiceArea is FALSE, it should say no dispatch is needed because the lead is outside the service area (the auto-reply already declined politely).';

const userMsg = 'NEW LEAD:\n'
  + 'Name: ' + name + '\n'
  + 'Email: ' + (email || '(none)') + '\n'
  + 'Phone: ' + (phone || '(none)') + '\n'
  + 'ZIP/City: ' + (zip || '(none)') + '\n'
  + 'Service selected: ' + (service || '(none)') + '\n'
  + 'How soon: ' + (urgency || '(none)') + '\n'
  + 'Message: ' + (message || '(none)');

const geminiBody = {
  systemInstruction: { parts: [{ text: sys }] },
  contents: [{ role: 'user', parts: [{ text: userMsg }] }],
  generationConfig: {
    temperature: 0.3,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING' },
        serviceType: { type: 'STRING', enum: ['HVAC', 'Plumbing', 'Electrical', 'Other'] },
        urgency: { type: 'STRING', enum: ['Emergency', 'Soon', 'Planning'] },
        inServiceArea: { type: 'BOOLEAN' },
        valueBand: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
        leadScore: { type: 'INTEGER' },
        temperature: { type: 'STRING', enum: ['Hot', 'Warm', 'Cold'] },
        reason: { type: 'STRING' },
        emailSubject: { type: 'STRING' },
        emailBody: { type: 'STRING' },
        suggestedReply: { type: 'STRING' },
      },
      required: ['summary', 'serviceType', 'urgency', 'inServiceArea', 'valueBand', 'leadScore', 'temperature', 'reason', 'emailSubject', 'emailBody', 'suggestedReply'],
    },
  },
};

return [{ json: {
  valid, process, reason,
  lead: { name, email, phone, zip, service, urgency, message },
  geminiBody,
} }];
