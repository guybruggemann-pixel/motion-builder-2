/**
 * Icon rail: Library toggle (black when open), Comps and Search (not built yet), theme toggle.
 * Every button has an aria-label and a tooltip on hover and focus.
 */
import { Layers3, Moon, Search, Sun } from "lucide-react";
import { cn } from "@/design-system/motionbuilder---brandbook-c4b4eb/lib/utils";
import { useUi } from "@/store";

function LibraryIcon() {
  return (
    <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <circle cx="16.5" cy="7.5" r="3.5" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <path d="M16.5 13.5v6" />
      <path d="M13.5 16.5h6" />
    </svg>
  );
}

function RailButton({ label, tip, on, soon, onClick, children }: { label: string; tip: string; on?: boolean; soon?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      aria-disabled={soon || undefined}
      onClick={soon ? undefined : onClick}
      className={cn(
        "group relative grid size-10 place-items-center rounded-full transition-colors [&>svg]:size-[19px]",
        on ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:bg-field hover:text-foreground",
        soon && "cursor-default opacity-50 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[50px] top-1/2 z-40 hidden -translate-y-1/2 whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-xs font-medium text-ink-foreground group-hover:block group-focus-visible:block"
      >
        {tip}
      </span>
    </button>
  );
}

export function Rail() {
  const { libraryOpen, setLibraryOpen, theme, setTheme } = useUi();
  const dark = theme === "dark";
  return (
    <nav aria-label="Panels" className="flex flex-col items-center gap-1.5 rounded-xl bg-card py-2.5 shadow-card [grid-area:rail] max-[900px]:flex-row max-[900px]:px-2.5">
      <RailButton label="Library" tip="Library · nodes and assets" on={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>
        <LibraryIcon />
      </RailButton>
      <RailButton label="Comps" tip="Comps and versions · coming later" soon>
        <Layers3 strokeWidth={1.5} />
      </RailButton>
      <RailButton label="Search and commands" tip="Search and commands · ⌘K · coming later" soon>
        <Search strokeWidth={1.5} />
      </RailButton>
      <div className="mt-auto flex flex-col items-center gap-2 max-[900px]:ml-auto max-[900px]:mt-0">
        <RailButton label={dark ? "Switch to light theme" : "Switch to dark theme"} tip={dark ? "Light theme" : "Dark theme"} onClick={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <Sun strokeWidth={1.5} /> : <Moon strokeWidth={1.5} />}
        </RailButton>
      </div>
    </nav>
  );
}
