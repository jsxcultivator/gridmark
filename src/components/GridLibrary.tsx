"use client";

import { memo, useMemo } from "react";
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
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true">
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
  return (
    <nav className="library" aria-label="Grids">
      {FAMILIES.map((family) => (
        <section key={family}>
          <h2>{FAMILY_LABELS[family]}</h2>
          <div className="thumbs">
            {GRIDS.filter((g) => g.family === family).map((g) => (
              <button
                key={g.id}
                type="button"
                className="thumb"
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
