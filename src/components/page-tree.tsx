"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { TreeNode } from "@/server/confluence/types";

interface Props {
  spaceKey: string;
  activeId?: string;
  /** Ancestors of the active page, expanded on first render. */
  expandedIds?: string[];
}

export function treeQueryKey(spaceKey: string, parentId: string) {
  return ["tree", spaceKey, parentId] as const;
}

function useChildren(spaceKey: string, parentId: string, enabled: boolean) {
  return useQuery({
    queryKey: treeQueryKey(spaceKey, parentId),
    queryFn: () =>
      fetchJson<{ nodes: TreeNode[] }>(
        `/api/tree?space=${encodeURIComponent(spaceKey)}&parent=${encodeURIComponent(parentId)}`,
      ).then((r) => r.nodes),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Lazy page tree: each level is fetched only when it's expanded. */
export function PageTree({ spaceKey, activeId, expandedIds = [] }: Props) {
  const initial = useRef(new Set(expandedIds));
  const { data, isLoading, isError } = useChildren(spaceKey, "root", true);

  if (isLoading) return <div className="tree-status">Loading pages…</div>;
  if (isError) return <div className="tree-status error">Couldn&apos;t load the page tree.</div>;
  if (!data?.length) return <div className="tree-status">No pages in this space.</div>;

  return (
    <ul className="tree" role="tree" aria-label="Pages">
      {data.map((node) => (
        <TreeItem key={node.id} node={node} spaceKey={spaceKey} activeId={activeId} initial={initial.current} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  spaceKey,
  activeId,
  initial,
}: {
  node: TreeNode;
  spaceKey: string;
  activeId?: string;
  initial: Set<string>;
}) {
  const [open, setOpen] = useState(() => initial.has(node.id));
  const { data, isLoading, isError } = useChildren(spaceKey, node.id, open && node.hasChildren);
  const isActive = node.id === activeId;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  return (
    <li role="treeitem" aria-expanded={node.hasChildren ? open : undefined} aria-selected={isActive}>
      <div ref={rowRef} className={`tree-row${isActive ? " active" : ""}`}>
        {node.hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.title}` : `Expand ${node.title}`}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <Link href={`/pages/${node.id}`} title={node.title} aria-current={isActive ? "page" : undefined}>
          {node.title}
        </Link>
      </div>
      {open && node.hasChildren && (
        <>
          {isLoading && <div className="tree-status">Loading…</div>}
          {isError && <div className="tree-status error">Couldn&apos;t load sub-pages.</div>}
          {data && data.length > 0 && (
            <ul role="group">
              {data.map((child) => (
                <TreeItem key={child.id} node={child} spaceKey={spaceKey} activeId={activeId} initial={initial} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
