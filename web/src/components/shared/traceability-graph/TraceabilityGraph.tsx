import { type ComponentPropsWithoutRef, type FC, useState, useCallback } from 'react';

import { cn } from '@utils';
import type { TraceNode, TraceType } from '@app-types';

export interface TraceabilityGraphProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  nodes: TraceNode[];
}

const LANE_ORDER: TraceType[] = [
  'requirement',
  'epic',
  'story',
  'task',
  'pr',
  'deployment',
  'release',
];

const LANE_LABELS: Record<TraceType, string> = {
  requirement: 'Requirement',
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
  pr: 'PR',
  deployment: 'Deployment',
  release: 'Release',
};

function getAncestors(nodeId: string, allNodes: TraceNode[]): Set<string> {
  const visited = new Set<string>();
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  function walk(id: string) {
    const node = nodeMap.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);
    if (node.parentId) walk(node.parentId);
  }

  walk(nodeId);
  return visited;
}

function getDescendants(nodeId: string, allNodes: TraceNode[]): Set<string> {
  const visited = new Set<string>();
  const childMap = new Map<string, string[]>();

  for (const n of allNodes) {
    if (n.parentId) {
      if (!childMap.has(n.parentId)) childMap.set(n.parentId, []);
      childMap.get(n.parentId)!.push(n.id);
    }
  }

  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const children = childMap.get(id) ?? [];
    for (const c of children) walk(c);
  }

  walk(nodeId);
  return visited;
}

const TraceabilityGraph: FC<TraceabilityGraphProps> = ({ nodes, className, ...props }) => {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Compute highlighted chain (ancestors + descendants)
  const highlightedChain: Set<string> = (() => {
    if (!highlightedId) return new Set<string>();
    const anc = getAncestors(highlightedId, nodes);
    const desc = getDescendants(highlightedId, nodes);
    return new Set([...anc, ...desc]);
  })();

  const handleNodeClick = useCallback(
    (id: string) => {
      setHighlightedId((prev) => (prev === id ? null : id));
    },
    [],
  );

  // Group nodes by lane type
  const byLane = new Map<TraceType, TraceNode[]>();
  for (const lane of LANE_ORDER) byLane.set(lane, []);
  for (const node of nodes) {
    const laneNodes = byLane.get(node.type);
    if (laneNodes) laneNodes.push(node);
  }

  // Coverage: non-orphan nodes / total
  const nonOrphanCount = nodes.filter((n) => n.status !== 'orphan').length;
  const coveragePct = nodes.length > 0 ? Math.round((nonOrphanCount / nodes.length) * 100) : 0;

  return (
    <div
      data-slot="traceability-graph"
      className={cn('flex flex-col gap-4', className)}
      {...props}
    >
      {/* Coverage header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Traceability Coverage</span>
        <span
          className={cn(
            'text-sm font-semibold',
            coveragePct >= 80 ? 'text-success' : coveragePct >= 50 ? 'text-warning' : 'text-destructive',
          )}
        >
          {coveragePct}%
        </span>
      </div>

      {/* Lanes */}
      <div
        className="grid gap-2 overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${LANE_ORDER.length}, minmax(110px, 1fr))` }}
        role="grid"
        aria-label="Traceability lanes"
      >
        {LANE_ORDER.map((laneType) => {
          const laneNodes = byLane.get(laneType) ?? [];
          return (
            <div
              key={laneType}
              className="flex flex-col gap-1.5"
              role="gridcell"
              aria-label={`${LANE_LABELS[laneType]} lane`}
            >
              {/* Lane header */}
              <div className="rounded-t border-b border-border bg-muted-50 px-2 py-1.5 text-center">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {LANE_LABELS[laneType]}
                </span>
              </div>

              {/* Nodes */}
              <div className="flex flex-col gap-1.5 px-1 pb-2">
                {laneNodes.length === 0 && (
                  <div className="rounded border border-dashed border-border py-2 text-center text-2xs text-muted-foreground/50">
                    —
                  </div>
                )}
                {laneNodes.map((node) => {
                  const isOrphan = node.status === 'orphan';
                  const isHighlighted = highlightedChain.has(node.id);
                  const isSelected = highlightedId === node.id;
                  const isDimmed = highlightedId !== null && !isHighlighted;

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => handleNodeClick(node.id)}
                      aria-pressed={isSelected}
                      aria-label={`${node.label}${isOrphan ? ' (orphan)' : ''}${node.status === 'in-progress' ? ' (in-progress)' : ''}`}
                      className={cn(
                        'w-full rounded border px-2 py-1.5 text-start text-2xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                        // Base style
                        !isOrphan && 'border-border bg-background text-foreground',
                        // Orphan: destructive outline
                        isOrphan && 'border-destructive bg-destructive-200 text-destructive',
                        // In-progress: subtle indicator
                        node.status === 'in-progress' && !isOrphan && 'border-warning bg-warning-200 text-warning',
                        // Highlighted
                        isHighlighted && !isOrphan && 'border-primary bg-primary-15 text-primary',
                        // Selected
                        isSelected && 'ring-1 ring-primary ring-offset-1',
                        // Dimmed
                        isDimmed && 'opacity-30',
                      )}
                    >
                      <span className="line-clamp-2 leading-snug">{node.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-border bg-background" />
          Ok
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-warning bg-warning-200" />
          In progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-destructive bg-destructive-200" />
          Orphan
        </span>
        <span className="ms-auto text-2xs">Click a node to highlight its chain</span>
      </div>
    </div>
  );
};

export default TraceabilityGraph;
