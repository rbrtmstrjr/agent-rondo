// ============================================================================
// Prepare — Code node (no credentials). Builds the knowledge base + a single
// batchEmbedContents request (all KB chunks + a memory-aware retrieval query),
// and loads the conversation memory (recent turns + rolling summary).
//
// PRODUCTION SWAP NOTE: for a large KB, embed the chunks once into a vector DB
// (Qdrant / Supabase pgvector) at ingest time and query it here instead.
// ============================================================================

const cfg = $('Config').first().json;
const wh = $('Chat Webhook').first().json;
const body = (wh && wh.body) ? wh.body : {};

const message = String(body.message || body.query || body.text || '').trim();
const sessionId = String(body.sessionId || body.session_id || 'anonymous').trim();

const KB = [
  { title: 'About Northwind Home Services', text: 'Northwind Home Services is a licensed, bonded and insured home-services company founded in 2009, serving the Greater Portland, Oregon metro area. We specialize in residential HVAC (heating, ventilation and air conditioning), plumbing, and electrical work. Our technicians are background-checked, drug-tested, and continuously trained. License #OR-CCB-204815.' },
  { title: 'Service Area', text: 'We serve the Greater Portland metro area including Portland, Beaverton, Hillsboro, Tigard, Lake Oswego, Gresham, Milwaukie, Oregon City, Tualatin, and West Linn. We do not currently service areas more than 30 miles from downtown Portland. If you are unsure whether you are in our service area, call us and we will confirm by ZIP code.' },
  { title: 'Business Hours', text: 'Our normal office and scheduling hours are Monday through Saturday, 7:00 AM to 7:00 PM Pacific Time. We are closed on Sundays for non-emergency work. Emergency service is available 24 hours a day, 7 days a week, including Sundays and holidays.' },
  { title: 'How to Book an Appointment', text: 'You can book an appointment three ways: (1) call us at (555) 010-4729, (2) use the booking form on our website, or (3) chat with us right here. For standard appointments we typically have availability within 1 to 2 business days. We offer 2-hour arrival windows and our dispatcher will text you when the technician is on the way.' },
  { title: 'Pricing and Estimates', text: 'We provide upfront, flat-rate pricing — you approve the price before any work begins, so there are no surprises. Estimates for new installations (such as a furnace or AC replacement) are free and include a written quote. For diagnostic visits on a repair, a service fee applies. We do not charge for travel time within our service area.' },
  { title: 'Diagnostic / Service Fee', text: 'A $89 diagnostic fee applies to repair service calls. This covers the technician travelling to your home and diagnosing the problem. If you approve the recommended repair, the $89 fee is fully applied toward the cost of that repair. The diagnostic fee is waived entirely for Northwind Care Club members.' },
  { title: 'Emergency and After-Hours Service', text: 'We offer 24/7 emergency service for urgent issues such as no heat in winter, no cooling during a heat advisory, burst or leaking pipes, sewage backups, sparking outlets, or a complete loss of power. After-hours emergency calls (outside Monday-Saturday 7 AM-7 PM) carry an additional after-hours dispatch fee of $75. Care Club members receive priority emergency scheduling and a waived dispatch fee.' },
  { title: 'HVAC Services', text: 'Our HVAC services include furnace repair and installation, air conditioner repair and installation, heat pump service, ductless mini-split installation, thermostat installation (including smart thermostats), duct cleaning and sealing, and seasonal tune-ups. We service all major brands including Carrier, Trane, Lennox, Rheem, and Goodman.' },
  { title: 'Plumbing Services', text: 'Our plumbing services include leak detection and repair, water heater repair and installation (tank and tankless), drain cleaning and hydro-jetting, toilet and faucet repair, garbage disposal installation, sewer line inspection and repair, repiping, and sump pump service. We do not service septic tank pumping.' },
  { title: 'Electrical Services', text: 'Our electrical services include panel upgrades and replacement, outlet and switch installation, EV charger installation, ceiling fan and lighting installation, whole-home surge protection, generator installation, wiring and rewiring, and electrical safety inspections. All electrical work is performed by licensed electricians and pulled to code with permits where required.' },
  { title: 'Northwind Care Club Membership', text: 'The Northwind Care Club is our maintenance membership plan at $19 per month or $199 per year. Members get: two seasonal HVAC tune-ups per year, an annual plumbing and electrical safety inspection, a waived $89 diagnostic fee, 15% off all repairs, priority scheduling, no after-hours dispatch fee, and a 2-year guarantee on repairs (instead of 1 year). Membership can be cancelled anytime.' },
  { title: 'Warranty and Guarantee', text: 'All repairs are backed by a 1-year workmanship guarantee (2 years for Care Club members). New equipment installations carry the manufacturer warranty (typically 5 to 10 years on parts) plus our 1-year labor warranty. If you are not satisfied with a repair, we will come back and make it right at no additional labor cost within the guarantee period. This is our Northwind Done-Right Promise.' },
  { title: 'Payment Methods and Financing', text: 'We accept all major credit cards (Visa, Mastercard, American Express, Discover), debit cards, cash, and check. For larger projects such as a system replacement, we offer financing with approved credit, including 0% APR plans for qualified customers over 12 months. Payment is due upon completion of the work unless financing has been arranged in advance.' },
  { title: 'Cancellation and Reschedule Policy', text: 'You can cancel or reschedule a standard appointment at no charge as long as you give us at least 4 hours notice. For cancellations with less than 4 hours notice, a $49 trip-reservation fee may apply. To cancel or reschedule, call (555) 010-4729 or reply to your appointment confirmation text.' },
  { title: 'Contact Information', text: 'You can reach Northwind Home Services by phone at (555) 010-4729, by email at hello@northwindhome.example, or through the contact form on our website. Our office is located at 1420 NW Marshall St, Portland, OR 97209. For the fastest response on an urgent issue, please call rather than email.' },
];

// ---- Conversation memory: load recent history + rolling summary for this session ----
let history = [];
let summary = '';
try {
  const sd = $getWorkflowStaticData('global');
  sd.sessions = sd.sessions || {};
  const now = Date.now();
  const ttlMs = Number(cfg.memoryTtlMin || 180) * 60000;
  for (const k of Object.keys(sd.sessions)) {
    if (now - (sd.sessions[k].updated || 0) > ttlMs) delete sd.sessions[k];
  }
  const sess = sd.sessions[sessionId];
  history = (sess && Array.isArray(sess.turns)) ? sess.turns : [];
  summary = (sess && sess.summary) ? sess.summary : '';
} catch (e) {
  history = [];
  summary = '';
}

// Retrieval query = recent user turns + current message, so follow-ups like
// "how much is that?" still retrieve the right KB chunks.
const recentUser = history.filter((t) => t.role === 'user').slice(-2).map((t) => t.text);
const retrievalQuery = [...recentUser, message].join(' \n ').trim() || 'hello';

const model = 'models/' + cfg.embedModel;
const texts = KB.map((c) => c.title + '. ' + c.text);
texts.push(retrievalQuery);

const requests = texts.map((t) => ({ model, content: { parts: [{ text: String(t).slice(0, 8000) }] } }));

return [{ json: {
  message,
  sessionId,
  kb: KB.map((c) => ({ title: c.title, text: c.text })),
  history,
  summary,
  embedBody: { requests },
} }];
