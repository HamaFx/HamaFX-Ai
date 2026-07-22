// SPDX-License-Identifier: Apache-2.0

// In-memory graph model for the architecture explorer.
// Provides graph operations: add/remove nodes/edges, adjacency lookup,
// path finding, and serialization.

import type { ArchNode, ArchEdge, EdgeType, NodeType } from './types.js';

export class GraphModel {
  private _nodeCounter = 0;
  private _edgeCounter = 0;
  private nodes = new Map<string, ArchNode>();
  private edges = new Map<string, ArchEdge>();
  private adjacency = new Map<string, Set<string>>(); // nodeId → connected nodeIds
  private outgoing = new Map<string, Set<string>>(); // nodeId → target nodeIds
  private incoming = new Map<string, Set<string>>(); // nodeId → source nodeIds

  private nodeId(): string {
    return `n${++this._nodeCounter}`;
  }

  private edgeId(): string {
    return `e${++this._edgeCounter}`;
  }

  resetCounters(): void {
    this._nodeCounter = 0;
    this._edgeCounter = 0;
  }

  addNode(opts: {
    type: NodeType;
    name: string;
    pkg?: string;
    path?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): string {
    const id = this.nodeId();
    const node: ArchNode = {
      id,
      type: opts.type,
      name: opts.name,
      pkg: opts.pkg ?? '',
      path: opts.path ?? '',
      description: opts.description ?? '',
      metadata: opts.metadata ?? {},
    };
    this.nodes.set(id, node);
    this.adjacency.set(id, new Set());
    this.outgoing.set(id, new Set());
    this.incoming.set(id, new Set());
    return id;
  }

  addEdge(opts: {
    source: string;
    target: string;
    type: EdgeType;
    metadata?: Record<string, unknown>;
  }): string {
    const id = this.edgeId();
    const edge: ArchEdge = {
      id,
      source: opts.source,
      target: opts.target,
      type: opts.type,
      metadata: opts.metadata ?? {},
    };
    this.edges.set(id, edge);

    // Update adjacency
    this.adjacency.get(opts.source)?.add(opts.target);
    this.adjacency.get(opts.target)?.add(opts.source);
    this.outgoing.get(opts.source)?.add(opts.target);
    this.incoming.get(opts.target)?.add(opts.source);

    return id;
  }

  getNode(id: string): ArchNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): ArchEdge | undefined {
    return this.edges.get(id);
  }

  findNode(name: string, type?: NodeType): ArchNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.name === name && (!type || node.type === type)) return node;
    }
    return undefined;
  }

  findNodeByPath(path: string): ArchNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.path === path) return node;
    }
    return undefined;
  }

  getAllNodes(): ArchNode[] {
    return [...this.nodes.values()];
  }

  getAllEdges(): ArchEdge[] {
    return [...this.edges.values()];
  }

  getNodesOfType(type: NodeType): ArchNode[] {
    return [...this.nodes.values()].filter((n) => n.type === type);
  }

  getNeighbors(nodeId: string): ArchNode[] {
    const neighborIds = this.adjacency.get(nodeId);
    if (!neighborIds) return [];
    return [...neighborIds].map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  getOutgoingEdges(nodeId: string): ArchEdge[] {
    return [...this.edges.values()].filter((e) => e.source === nodeId);
  }

  getIncomingEdges(nodeId: string): ArchEdge[] {
    return [...this.edges.values()].filter((e) => e.target === nodeId);
  }

  /** Find the shortest path between two nodes (BFS). */
  findPath(fromId: string, toId: string): string[] | null {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;
    if (fromId === toId) return [fromId];

    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: string[] = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.outgoing.get(current);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        parent.set(neighbor, current);
        if (neighbor === toId) {
          // Reconstruct path
          const path: string[] = [toId];
          let step = toId;
          while (parent.has(step)) {
            step = parent.get(step)!;
            path.unshift(step);
          }
          return path;
        }
        queue.push(neighbor);
      }
    }
    return null;
  }

  /** Find all nodes reachable from a starting node. */
  reachableFrom(nodeId: string): string[] {
    if (!this.nodes.has(nodeId)) return [];
    const visited = new Set<string>();
    const queue: string[] = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.outgoing.get(current);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    visited.delete(nodeId);
    return [...visited];
  }

  /** Get all nodes that eventually lead to this node. */
  ancestorsOf(nodeId: string): string[] {
    if (!this.nodes.has(nodeId)) return [];
    const visited = new Set<string>();
    const queue: string[] = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const sources = this.incoming.get(current);
      if (!sources) continue;
      for (const source of sources) {
        if (!visited.has(source)) {
          visited.add(source);
          queue.push(source);
        }
      }
    }
    visited.delete(nodeId);
    return [...visited];
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.edges.size;
  }

  toJSON(): { nodes: ArchNode[]; edges: ArchEdge[] } {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }
}
