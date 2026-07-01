import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { WorkIndex } from "@/components/work/work-index";
import { DesignGrid } from "@/components/sections/design-grid";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Production-grade AI automations and builds — chatbots, lead pipelines, document extraction, and content engines. Real systems, running in production.",
};

export default function WorkPage() {
  return (
    <>
      <PageHeader
        eyebrow="Selected work"
        title={
          <>
            Systems that do the work,{" "}
            <span className="text-gradient-gold">so people don&apos;t have to.</span>
          </>
        }
        desc="Each of these is built to a production standard — input validation, error handling, idempotency, and a human-in-the-loop wherever it matters. Tap one to see the problem, the build, and the result."
      />
      <section className="px-4 pb-8">
        <div className="mx-auto max-w-7xl">
          <WorkIndex />
        </div>
      </section>
      <DesignGrid />
    </>
  );
}
