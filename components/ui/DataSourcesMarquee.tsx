"use client";

/**
 * DataSourcesMarquee
 *
 * Horizontal auto-scrolling strip showing all data sources.
 * Pauses on hover. Duplicates content for seamless infinite loop.
 */

import { useRef, useEffect, useState } from "react";

const DATA_SOURCES = [
  "IRS",
  "SEC",
  "FEC",
  "CFPB",
  "CMS",
  "OFAC",
  "EPA",
  "FDA",
  "HHS",
  "SAM.gov",
  "Congress.gov",
  "USASpending.gov",
  "ProPublica",
  "FinCEN",
  "FTC",
  "DOL",
  "DOJ",
  "GSA",
  "Treasury",
  "DOE",
  "HUD",
  "ED",
  "VA",
  "DOD",
  "USSpending",
  "Federal Register",
  "Bureau of Labor",
  "NCUA",
  "OCC",
  "FDIC",
  "CFTC",
  "SEC EDGAR",
  "State Dept",
];

export function DataSourcesMarquee() {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const scrollPos = useRef(0);
  const animFrame = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const speed = 0.5; // pixels per frame

    const animate = () => {
      if (!isHovered) {
        scrollPos.current += speed;

        // Reset when we've scrolled half (the duplicated content)
        const halfWidth = content.scrollWidth / 2;
        if (scrollPos.current >= halfWidth) {
          scrollPos.current = 0;
        }

        container.scrollLeft = scrollPos.current;
      }

      animFrame.current = requestAnimationFrame(animate);
    };

    animFrame.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame.current);
    };
  }, [isHovered]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden whitespace-nowrap py-4 border-t border-gray-800/50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={contentRef}
        className="inline-flex items-center gap-6 px-4"
      >
        {/* Render twice for seamless loop */}
        {[...DATA_SOURCES, ...DATA_SOURCES].map((source, i) => (
          <span
            key={`${source}-${i}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-800/60 bg-gray-900/40 text-xs text-gray-400 font-medium tracking-wide"
          >
            <span className="w-1 h-1 rounded-full bg-red-500/50" />
            {source}
          </span>
        ))}
      </div>
    </div>
  );
}
