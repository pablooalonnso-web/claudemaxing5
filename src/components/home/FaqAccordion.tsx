"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

export type FaqItem = { q: string; a: ReactNode };

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="home-faq">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className="home-faq-item">
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                <span>{it.q}</span>
                <ChevronDown size={18} strokeWidth={1.5} aria-hidden="true" style={{ transform: isOpen ? "rotate(180deg)" : undefined }} />
              </button>
            </h3>
            <div id={`faq-${i}`} className="home-faq-body" data-open={isOpen}>
              <div>
                <p>{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
      <p className="home-faq-more">
        Can&apos;t find your answer here? <Link href="/help">Search the help center</Link>.
      </p>
    </div>
  );
}
