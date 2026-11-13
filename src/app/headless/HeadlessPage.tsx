// The /render page: no editor, only the renderer behind `window.mbHeadless` (see api.ts).
import "../styles.css";
import { useEffect, useState } from "react";
import { installHeadless } from "./api";

export default function HeadlessPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    installHeadless();
    setReady(true);
  }, []);
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground" data-headless={ready ? "ready" : "loading"}>
      Motion Builder render page. Driven by <code className="mx-1">bun run render</code>; nothing to see here.
    </div>
  );
}
