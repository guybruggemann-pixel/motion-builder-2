import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const HeadlessPage = lazy(() => import("@/app/headless/HeadlessPage"));

/** The headless render page: the app's renderer without the editor, for `tools/render/`. */
export const Route = createFileRoute("/render")({
  head: () => ({ meta: [{ title: "Motion Builder render" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ClientOnly fallback={null}>
      <Suspense fallback={null}>
        <HeadlessPage />
      </Suspense>
    </ClientOnly>
  ),
});
