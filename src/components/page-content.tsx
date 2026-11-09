"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Renders sanitized Confluence HTML and adds the small behaviours Confluence
 * normally provides with its own scripts (expand macros, wide tables), plus
 * client-side navigation for links to other pages in this app.
 */
export function PageContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // Wrap tables so wide ones scroll horizontally instead of breaking the layout.
    root.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    // Expand macros: make the control keyboard-accessible.
    root.querySelectorAll<HTMLElement>(".expand-container > .expand-control").forEach((control) => {
      control.setAttribute("role", "button");
      control.setAttribute("tabindex", "0");
      control.setAttribute("aria-expanded", "false");
    });

    const toggleExpand = (control: HTMLElement) => {
      const container = control.closest(".expand-container");
      if (!container) return;
      const open = container.classList.toggle("is-open");
      control.setAttribute("aria-expanded", String(open));
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const control = target.closest<HTMLElement>(".expand-control");
      if (control && root.contains(control)) {
        e.preventDefault();
        toggleExpand(control);
        return;
      }
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const href = link.getAttribute("href") ?? "";
      if ((href.startsWith("/pages/") || href.startsWith("/spaces/") || href.startsWith("/resolve?")) && !href.startsWith("//")) {
        e.preventDefault();
        router.push(href);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const control = (e.target as HTMLElement).closest<HTMLElement>(".expand-control");
      if (control && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        toggleExpand(control);
      }
    };
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("keydown", onKey);
    };
  }, [html, router]);

  return <div ref={ref} className="confluence-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
