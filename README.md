# Robert Maestro — Portfolio (v2)

Premium, story-driven portfolio positioning Robert as an **AI Automation specialist**
who can also build the full stack (web, mobile, UI/UX, graphics). Replaces the 2023
"creative web designer" site.

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` tokens in `app/globals.css`)
- **Framer Motion** (scroll reveals, 3D tilt, count-ups)
- Deploy target: **Vercel**

## Design system

Modern Dark / Cinema + Aurora mesh. Deep indigo base (`#03001C`), bright yellow accent
(`#FFC700`), cyan tech-glow. Fonts: **Space Grotesk** (display), **Inter** (body),
**JetBrains Mono** (labels/stats). All tokens live in `app/globals.css`.

## Structure

```
app/
  page.tsx              Home — full story spine (hook → problem → proof → work → plan → services)
  work/                 Case studies index (filterable) + /work/[slug] detail pages
  services/[slug]/      Service pages (AI Automation is the flagship)
  about/                Story, journey, toolkit
  contact/              Contact form
  api/contact/          Form endpoint (backend-ready stub — see below)
components/             ui/, sections/, visual/ (aurora, tilt, workflow-graph), work/, services/
content/site.ts        ← single content source: services + case studies. Add an object = new page.
lib/                   utils, motion presets
```

## Content is data-driven (scalable)

Services and case studies are plain objects in [`content/site.ts`](content/site.ts).
Add one and its page, nav, and listings update automatically. Later this can be swapped
for a CMS/DB with no UI changes.

## The contact form (going live later)

`app/api/contact/route.ts` validates input (+ spam honeypot) and returns success. To
actually deliver messages, set `CONTACT_WEBHOOK_URL` (e.g. an n8n lead webhook) and it
forwards each submission into the automation pipeline — no front-end changes needed.

## Still placeholder (intentional, swap in later)

- Hero / About **photos** → `components/visual/placeholder.tsx` tiles
- Case-study **demos** (Loom videos / live chatbot embed)
- Web-design **screenshots** in the Work-page gallery
- Real **social links** + resume PDF

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```
