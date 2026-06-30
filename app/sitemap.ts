import type { MetadataRoute } from "next";
import { services, caseStudies } from "@/content/site";

const BASE = "https://my-portfolio.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/work", "/about", "/contact"].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.8,
  }));

  const serviceRoutes = services.map((s) => ({
    url: `${BASE}/services/${s.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const workRoutes = caseStudies.map((c) => ({
    url: `${BASE}/work/${c.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...serviceRoutes, ...workRoutes];
}
