import { NextResponse } from "next/server";

/**
 * Contact endpoint — backend-ready stub.
 *
 * Right now it just validates and acknowledges (no message is sent yet).
 * TO GO LIVE: set CONTACT_WEBHOOK_URL (e.g. an n8n lead webhook) and the
 * block below will forward the submission into the automation pipeline —
 * dogfooding the same lead-capture system shown in the case studies.
 * No front-end changes required.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim();
  const company = String(body.company ?? "").trim(); // honeypot

  // Spam honeypot — bots fill hidden fields; silently accept.
  if (company) return NextResponse.json({ ok: true });

  if (!name || !email || !message) {
    return NextResponse.json({ ok: false, error: "Please fill in all fields." }, { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 422 });
  }

  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, service: body.service ?? "", source: "portfolio" }),
      });
    } catch {
      // Don't fail the user if the downstream hook is momentarily down.
    }
  }

  return NextResponse.json({ ok: true });
}
