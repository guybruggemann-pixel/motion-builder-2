// Browser-only entry for Motion Builder: loaded lazily after hydration (canvas, WebGL, workers).
import "./styles.css";
import { useEffect } from "react";
import { App } from "./App";
import { install3D } from "./render/three/install";

let installed = false;

export default function MotionBuilder() {
  if (!installed) {
    install3D();
    installed = true;
  }
  useEffect(() => {
    try {
      if (localStorage.getItem("mb.theme") === "dark") document.documentElement.classList.add("dark");
    } catch {}
  }, []);
  return (
    <div id="root" style={{ height: "100vh" }}>
      <App />
    </div>
  );
}
