import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const MotionBuilder = lazy(() => import("@/app/MotionBuilder"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Motion Builder" },
      { name: "description", content: "Node-based motion design: 2D and 3D comps, ProRes/MP4 renders, batches and After Effects passes." },
      { property: "og:title", content: "Motion Builder" },
      { property: "og:description", content: "Node-based motion design in the browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const loading = <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading Motion Builder…</div>;
  return (
    <ClientOnly fallback={loading}>
      <Suspense fallback={loading}>
        <MotionBuilder />
      </Suspense>
    </ClientOnly>
  );
}
