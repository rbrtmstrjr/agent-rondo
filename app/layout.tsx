import type { Metadata } from "next";
import { Agdasima, Inter, JetBrains_Mono } from "next/font/google";
import { site } from "@/content/site";
import { Nav } from "@/components/nav";
import { BottomNav } from "@/components/bottom-nav";
import { Footer } from "@/components/footer";
import { ScrollProgress } from "@/components/visual/scroll-progress";
import "./globals.css";

const agdasima = Agdasima({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-agdasima",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://my-portfolio.vercel.app"),
  title: {
    default: `${site.name} — ${site.role}`,
    template: `%s — ${site.name}`,
  },
  description:
    "I build production-grade AI automations — chatbots, lead pipelines, document extraction, and content engines — that run your busywork 24/7. Web, UI/UX, and graphics too.",
  keywords: [
    "AI automation",
    "n8n",
    "AI chatbot",
    "workflow automation",
    "lead automation",
    "Next.js developer",
    "freelancer",
  ],
  openGraph: {
    title: `${site.name} — ${site.role}`,
    description:
      "Production-grade AI automation that runs your busywork 24/7. Chatbots, lead pipelines, document extraction, and more.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.role}`,
    description: "Production-grade AI automation that runs your busywork 24/7.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${agdasima.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to content
        </a>
        <Nav />
        <ScrollProgress />
        <main id="main">{children}</main>
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
