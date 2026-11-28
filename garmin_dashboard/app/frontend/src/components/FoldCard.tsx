import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** Carte repliable : les sections secondaires d'une sortie (puissance, dynamiques, tours) s'ouvrent à la demande. */
export function FoldCard({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Card className={open ? undefined : "gap-0"}>
      <h2 className="m-0 px-6">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="hk-press -my-2 flex min-h-11 w-full items-center justify-between gap-3 text-left text-base font-semibold">
          {title}
          <ChevronDown aria-hidden className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </h2>
      {open && <CardContent id={id}>{children}</CardContent>}
    </Card>
  );
}
