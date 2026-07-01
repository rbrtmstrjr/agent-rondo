// ============================================================================
// RAG Engine — body of the "RAG Engine" Code node (n8n Code node, typeVersion 2)
// ----------------------------------------------------------------------------
// Runs once per incoming chat message. Does retrieval-augmented generation:
//   1. Embeds the knowledge base (cached in workflow static data after 1st run)
//   2. Embeds the user's question
//   3. Cosine-similarity retrieval of the top-K relevant chunks
//   4. Grounded answer from Gemini using ONLY those chunks
//   5. Escalation flag when the answer isn't in the KB (anti-hallucination)
//
// This file is the source of truth; build.js injects it into the workflow JSON.
// It uses n8n Code-node globals ($, items, this.helpers, this.getWorkflowStaticData)
// so it does NOT run standalone — that's expected.
//
// PRODUCTION SWAP NOTE: for large knowledge bases, replace the inline KB +
// static-data cache with a real vector DB (Qdrant / Supabase pgvector / Pinecone).
// The retrieval/grounding logic below stays identical.
// ============================================================================

const cfg = $('Config').first().json;
const wh = $('Chat Webhook').first().json;
const body = (wh && wh.body) ? wh.body : {};

const message = String(body.message || body.query || body.text || '').trim();
const sessionId = String(body.sessionId || body.session_id || 'anonymous').trim();

// --- Knowledge base (the demo company's docs). One object = one retrievable chunk.
const KB = [
  { id: 'about', title: 'About Northwind Home Services',
    text: 'Northwind Home Services is a licensed, bonded and insured home-services company founded in 2009, serving the Greater Portland, Oregon metro area. We specialize in residential HVAC (heating, ventilation and air conditioning), plumbing, and electrical work. Our technicians are background-checked, drug-tested, and continuously trained. License #OR-CCB-204815.' },
  { id: 'service_area', title: 'Service Area',
    text: 'We serve the Greater Portland metro area including Portland, Beaverton, Hillsboro, Tigard, Lake Oswego, Gresham, Milwaukie, Oregon City, Tualatin, and West Linn. We do not currently service areas more than 30 miles from downtown Portland. If you are unsure whether you are in our service area, call us and we will confirm by ZIP code.' },
  { id: 'hours', title: 'Business Hours',
    text: 'Our normal office and scheduling hours are Monday through Saturday, 7:00 AM to 7:00 PM Pacific Time. We are closed on Sundays for non-emergency work. Emergency service is available 24 hours a day, 7 days a week, including Sundays and holidays.' },
  { id: 'booking', title: 'How to Book an Appointment',
    text: 'You can book an appointment three ways: (1) call us at (555) 010-4729, (2) use the booking form on our website, or (3) chat with us right here. For standard appointments we typically have availability within 1 to 2 business days. We offer 2-hour arrival windows and our dispatcher will text you when the technician is on the way.' },
  { id: 'pricing', title: 'Pricing and Estimates',
    text: 'We provide upfront, flat-rate pricing — you approve the price before any work begins, so there are no surprises. Estimates for new installations (such as a furnace or AC replacement) are free and include a written quote. For diagnostic visits on a repair, a service fee applies (see the service fee policy). We do not charge for travel time within our service area.' },
  { id: 'service_fee', title: 'Diagnostic / Service Fee',
    text: 'A $89 diagnostic fee applies to repair service calls. This covers the technician travelling to your home and diagnosing the problem. If you approve the recommended repair, the $89 fee is fully applied toward the cost of that repair. The diagnostic fee is waived entirely for Northwind Care Club members.' },
  { id: 'emergency', title: 'Emergency and After-Hours Service',
    text: 'We offer 24/7 emergency service for urgent issues such as no heat in winter, no cooling during a heat advisory, burst or leaking pipes, sewage backups, sparking outlets, or a complete loss of power. After-hours emergency calls (outside Monday-Saturday 7 AM-7 PM) carry an additional after-hours dispatch fee of $75. Care Club members receive priority emergency scheduling and a waived dispatch fee.' },
  { id: 'hvac', title: 'HVAC Services',
    text: 'Our HVAC services include furnace repair and installation, air conditioner repair and installation, heat pump service, ductless mini-split installation, thermostat installation (including smart thermostats), duct cleaning and sealing, and seasonal tune-ups. We service all major brands including Carrier, Trane, Lennox, Rheem, and Goodman.' },
  { id: 'plumbing', title: 'Plumbing Services',
    text: 'Our plumbing services include leak detection and repair, water heater repair and installation (tank and tankless), drain cleaning and hydro-jetting, toilet and faucet repair, garbage disposal installation, sewer line inspection and repair, repiping, and sump pump service. We do not service septic tank pumping.' },
  { id: 'electrical', title: 'Electrical Services',
    text: 'Our electrical services include panel upgrades and replacement, outlet and switch installation, EV charger installation, ceiling fan and lighting installation, whole-home surge protection, generator installation, wiring and rewiring, and electrical safety inspections. All electrical work is performed by licensed electricians and pulled to code with permits where required.' },
  { id: 'care_club', title: 'Northwind Care Club Membership',
    text: 'The Northwind Care Club is our maintenance membership plan at $19 per month or $199 per year. Members get: two seasonal HVAC tune-ups per year, an annual plumbing and electrical safety inspection, a waived $89 diagnostic fee, 15% off all repairs, priority scheduling, no after-hours dispatch fee, and a 2-year guarantee on repairs (instead of 1 year). Membership can be cancelled anytime.' },
  { id: 'warranty', title: 'Warranty and Guarantee',
    text: 'All repairs are backed by a 1-year workmanship guarantee (2 years for Care Club members). New equipment installations carry the manufacturer warranty (typically 5 to 10 years on parts) plus our 1-year labor warranty. If you are not satisfied with a repair, we will come back and make it right at no additional labor cost within the guarantee period. This is our Northwind Done-Right Promise.' },
  { id: 'payment', title: 'Payment Methods and Financing',
    text: 'We accept all major credit cards (Visa, Mastercard, American Express, Discover), debit cards, cash, and check. For larger projects such as a system replacement, we offer financing with approved credit, including 0% APR plans for qualified customers over 12 months. Payment is due upon completion of the work unless financing has been arranged in advance.' },
  { id: 'cancellation', title: 'Cancellation and Reschedule Policy',
    text: 'You can cancel or reschedule a standard appointment at no charge as long as you give us at least 4 hours notice. For cancellations with less than 4 hours notice, a $49 trip-reservation fee may apply. To cancel or reschedule, call (555) 010-4729 or reply to your appointment confirmation text.' },
  { id: 'contact', title: 'Contact Information',
    text: 'You can reach Northwind Home Services by phone at (555) 010-4729, by email at hello@northwindhome.example, or through the contact form on our website. Our office is located at 1420 NW Marshall St, Portland, OR 97209. For the fastest response on an urgent issue, please call rather than email.' }
];

const KB_VERSION = String(cfg.kbVersion || 'v1');
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + cfg.embedModel + ':embedContent';
const CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + cfg.chatModel + ':generateContent';

// Arrow functions preserve `this` so the n8n helper stays bound.
const embed = async (text) => {
  const r = await this.helpers.httpRequestWithAuthentication('googlePalmApi', {
    method: 'POST',
    url: EMBED_URL,
    body: { model: 'models/' + cfg.embedModel, content: { parts: [{ text: String(text).slice(0, 8000) }] } },
    json: true,
  });
  return (r && r.embedding && r.embedding.values) ? r.embedding.values : null;
};

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

// Friendly greeting / empty-input guard — never hit the model for nothing.
if (!message) {
  return [{ json: {
    reply: 'Hi! I\'m the ' + cfg.companyName + ' virtual assistant. Ask me about our services, hours, pricing, booking, or anything else and I\'ll help right away.',
    escalate: false, score: 0, sources: [], message: '', sessionId,
  } }];
}

try {
  // 1) Build (or reuse cached) KB embeddings. Re-embeds only when KB_VERSION changes.
  const sd = $getWorkflowStaticData('global');
  if (sd.kbVersion !== KB_VERSION || !Array.isArray(sd.kbVec) || sd.kbVec.length !== KB.length) {
    const vec = [];
    for (const c of KB) {
      const v = await embed(c.title + '. ' + c.text);
      if (v) vec.push({ id: c.id, title: c.title, text: c.text, v });
    }
    sd.kbVec = vec;
    sd.kbVersion = KB_VERSION;
  }

  // 2) Embed the question and retrieve top-K chunks.
  const qv = await embed(message);
  if (!qv) throw new Error('question embedding failed');

  const topK = Number(cfg.topK || 4);
  const ranked = sd.kbVec
    .map((c) => ({ title: c.title, text: c.text, s: cosine(qv, c.v) }))
    .sort((a, b) => b.s - a.s);
  const top = ranked.slice(0, topK);
  const score = top.length ? top[0].s : 0;
  const context = top.map((c) => '[' + c.title + ']\n' + c.text).join('\n\n');

  // 3) Grounded answer. The model is instructed to ONLY use the context and to
  //    emit the literal token ESCALATE when the answer is not present.
  const sys = 'You are the friendly, professional virtual customer-support assistant for ' + cfg.companyName + '. '
    + 'Answer the customer\'s question using ONLY the information in the CONTEXT below. '
    + 'Rules: (1) Never invent or guess prices, policies, phone numbers, hours, or services. '
    + '(2) If the answer is not clearly contained in the CONTEXT, reply with exactly the single word ESCALATE and nothing else. '
    + '(3) Keep answers concise (2-5 sentences), warm, and helpful. '
    + '(4) Do not mention the word "context" or that you are reading from documents. '
    + '(5) When relevant, invite the customer to book or call.';

  const chat = await this.helpers.httpRequestWithAuthentication('googlePalmApi', {
    method: 'POST',
    url: CHAT_URL,
    body: {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: 'CONTEXT:\n' + context + '\n\nCUSTOMER QUESTION: ' + message }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
    },
    json: true,
  });

  let answer = '';
  try { answer = chat.candidates[0].content.parts.map((p) => p.text || '').join('').trim(); } catch (e) { answer = ''; }

  // 4) Decide: answer vs escalate (model said ESCALATE, empty, or retrieval too weak).
  const minScore = Number(cfg.minScore || 0.45);
  let escalate = false;
  if (!answer || answer.toUpperCase().replace(/[^A-Z]/g, '') === 'ESCALATE' || answer.toUpperCase().includes('ESCALATE') || score < minScore) {
    escalate = true;
    answer = 'Thanks for reaching out! I want to make sure you get a fully accurate answer on that, so I\'ve passed your question to our ' + cfg.companyName + ' team and someone will follow up shortly. For anything urgent, please call us at ' + cfg.phone + '.';
  }

  return [{ json: { reply: answer, escalate, score: Number(score.toFixed(3)), sources: top.map((t) => t.title), message, sessionId } }];
} catch (err) {
  // Total failure (API down, etc.) — never crash the webhook; hand off gracefully.
  return [{ json: {
    reply: 'Sorry, I\'m having a little trouble right now. Please call us at ' + cfg.phone + ' and our team will help you straight away.',
    escalate: true, score: 0, sources: [], message, sessionId, error: String(err && err.message || err),
  } }];
}
