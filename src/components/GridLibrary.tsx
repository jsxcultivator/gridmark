"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { guidesPath } from "@/lib/export";
import { FAMILY_LABELS, GRIDS, type GridDef, type GridFamily } from "@/lib/grids";

const thumbCache = new Map<string, string>();
function thumbPath(grid: GridDef): string {
  let d = thumbCache.get(grid.id);
  if (d === undefined) {
    d = guidesPath(grid.build());
    thumbCache.set(grid.id, d);
  }
  return d;
}

const Thumb = memo(function Thumb({ grid }: { grid: GridDef }) {
  const d = useMemo(() => thumbPath(grid), [grid]);
  // The middle of the sheet, enlarged: the whole grid at this size is a blur.
  return (
    <svg viewBox="60 60 120 120" aria-hidden="true">
      <path d={d} />
    </svg>
  );
});

interface Props {
  activeId: string;
  onPick: (id: string) => void;
}

const FAMILIES: GridFamily[] = ["straight", "round", "radial"];

export default function GridLibrary({ activeId, onPick }: Props) {
  const nav = useRef<HTMLElement>(null);

  // Keep the grid on the sheet in view, for instance after opening a link
  // to a drawing made on a grid far down the list.
  useEffect(() => {
    nav.current
      ?.querySelector<HTMLElement>(`[data-grid="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <nav className="library" aria-label="Grids" ref={nav}>
      {FAMILIES.map((family) => (
        <section key={family}>
          <h2>{FAMILY_LABELS[family]}</h2>
          <div className="thumbs">
            {GRIDS.filter((g) => g.family === family).map((g) => (
              <button
                key={g.id}
                type="button"
                className="thumb"
                data-grid={g.id}
                aria-pressed={g.id === activeId}
                title={g.hint}
                onClick={() => onPick(g.id)}
              >
                <Thumb grid={g} />
                <span>{g.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
