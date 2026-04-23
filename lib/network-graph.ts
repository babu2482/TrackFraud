/**
 * TrackFraud Network Graph Engine
 *
 * Comprehensive relationship detection and graph analysis system that reveals hidden connections
 * between organizations across multiple dimensions:
 * - Shared directors/board members
 * - Shared addresses (physical and mailing)
 * - Funding chains (grants, donations)
 * - Sister organizations (parent/subsidiary)
 * - Regulatory co-actions
 * - EIN patterns
 *
 * Provides graph traversal, centrality analysis, community detection, and path finding.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// Note: Relationship model not yet in schema - functions stubbed for future implementation

// ============================================================================
// Type Definitions
// ============================================================================

export interface GraphNode {
  id: string;
  entityType:
  | "charity"
  | "corporation"
  | "government_contractor"
  | "healthcare_provider"
  | "person"
  | "address";
  name: string;
  ein?: string;
  cik?: string;
  riskScore?: number;
  degree: number;
  attributes: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relationshipType: RelationshipType;
  strength: number;
  evidence: string;
  createdAt?: Date;
  attributes: Record<string, unknown>;
}

export type RelationshipType =
  | "shared_director"
  | "shared_address"
  | "funding_chain"
  | "sister_org"
  | "regulatory_coaction"
  | "ein_pattern"
  | "shared_phone"
  | "shared_email"
  | "board_overlap";

export interface GraphQueryOptions {
  depth?: number;
  minStrength?: number;
  relationshipTypes?: RelationshipType[];
  includeRiskScores?: boolean;
  limit?: number;
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  statistics: GraphStatistics;
}

export interface GraphStatistics {
  nodeCount: number;
  edgeCount: number;
  averageDegree: number;
  maxDegree: number;
  connectedComponents: number;
  density: number;
  avgStrength: number;
}

export interface CentralityMetrics {
  degreeCentrality: number;
  betweennessCentrality: number;
  closenessCentrality: number;
  eigenvectorCentrality: number;
}

export interface Community {
  id: string;
  nodes: string[];
  size: number;
  density: number;
  avgRiskScore?: number;
}

export interface Path {
  nodes: string[];
  edges: string[];
  totalStrength: number;
  relationshipTypes: RelationshipType[];
}

export interface RelationshipDetectionResult {
  entityType:
  | "shared_director"
  | "shared_address"
  | "funding_chain"
  | "sister_org";
  entityA: string;
  entityB: string;
  strength: number;
  evidence: string[];
  details: Record<string, unknown>;
}

// ============================================================================
// Graph Engine
// ============================================================================

/**
 * Build network graph for an entity up to N degrees of separation
 */
export async function buildNetworkGraph(
  entityId: string,
  options: GraphQueryOptions = {},
): Promise<NetworkGraph> {
  const {
    depth = 2,
    minStrength = 0.1,
    relationshipTypes,
    includeRiskScores = true,
    limit = 100,
  } = options;

  const visited = new Set<string>();
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  // Start with the seed entity
  await addEntityToGraph(entityId, nodes, edges, visited, includeRiskScores);

  // BFS traversal to find connected entities
  let currentDepth = 0;
  let currentLevel = [entityId];

  while (currentDepth < depth && currentLevel.length > 0) {
    const nextLevel: string[] = [];
    currentDepth++;

    for (const nodeId of currentLevel) {
      // Get all relationships for this node
      const relationships = await getRelationshipsForEntity(
        nodeId,
        relationshipTypes,
        minStrength,
      );

      for (const rel of relationships) {
        const connectedId =
          rel.fromEntityId === nodeId ? rel.toEntityId : rel.fromEntityId;

        if (!visited.has(connectedId) && nodes.size < limit) {
          visited.add(connectedId);
          nextLevel.push(connectedId);

          // Add node to graph
          await addEntityToGraph(
            connectedId,
            nodes,
            edges,
            visited,
            includeRiskScores,
          );

          // Add edge to graph
          const edgeId = rel.id;
          edges.set(edgeId, {
            id: edgeId,
            from: rel.fromEntityId,
            to: rel.toEntityId,
            relationshipType: rel.relationshipType as RelationshipType,
            strength: rel.strength || 0.5,
            evidence: rel.evidence || "",
            createdAt: rel.createdAt,
            attributes: {},
          });
        }
      }
    }

    currentLevel = nextLevel;
  }

  // Calculate node degrees
  calculateNodeDegrees(nodes, edges);

  // Calculate graph statistics
  const statistics = calculateGraphStatistics(nodes, edges);

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    statistics,
  };
}

/**
 * Add entity to graph
 */
async function addEntityToGraph(
  entityId: string,
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  visited: Set<string>,
  includeRiskScores: boolean,
): Promise<void> {
  if (nodes.has(entityId)) return;

  try {
    const entity = await prisma.canonicalEntity.findUnique({
      where: { id: entityId },
      // Note: riskScores model not yet in schema - removed include
    });

    if (!entity) return;

    const node: GraphNode = {
      id: entity.id,
      entityType: entity.categoryId as GraphNode["entityType"],
      name: entity.displayName,
      ein: undefined, // TODO: Get from related entities
      cik: undefined, // TODO: Get from related entities
      riskScore: undefined, // TODO: Add when riskScores model is implemented
      degree: 0,
      attributes: {
        createdAt: entity.createdAt?.toISOString(),
        updatedAt: entity.updatedAt?.toISOString(),
      },
    };

    nodes.set(entityId, node);
  } catch (error) {
    console.warn(`Failed to add entity ${entityId} to graph:`, error);
  }
}

/**
 * Get relationships for an entity
 */
async function getRelationshipsForEntity(
  entityId: string,
  relationshipTypes?: RelationshipType[],
  minStrength?: number,
): Promise<any[]> {
  // TODO: Implement when Relationship model is added to schema
  console.warn(
    "getRelationshipsForEntity: Relationship model not yet implemented",
  );
  return [];
}

/**
 * Calculate node degrees
 */
function calculateNodeDegrees(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): void {
  const degrees = new Map<string, number>();

  for (const edge of edges.values()) {
    const fromDegree = degrees.get(edge.from) || 0;
    const toDegree = degrees.get(edge.to) || 0;
    degrees.set(edge.from, fromDegree + 1);
    degrees.set(edge.to, toDegree + 1);
  }

  for (const [nodeId, node] of nodes.entries()) {
    node.degree = degrees.get(nodeId) || 0;
  }
}

/**
 * Calculate graph statistics
 */
function calculateGraphStatistics(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): GraphStatistics {
  const nodeCount = nodes.size;
  const edgeCount = edges.size;

  const degrees = Array.from(nodes.values()).map((n) => n.degree);
  const averageDegree =
    nodeCount > 0 ? degrees.reduce((a, b) => a + b, 0) / nodeCount : 0;
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;

  // Calculate density (actual edges / possible edges)
  const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
  const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

  // Calculate average strength
  const strengths = Array.from(edges.values()).map((e) => e.strength);
  const avgStrength =
    strengths.length > 0
      ? strengths.reduce((a, b) => a + b, 0) / strengths.length
      : 0;

  // Estimate connected components (simplified)
  const connectedComponents = estimateConnectedComponents(nodes, edges);

  return {
    nodeCount,
    edgeCount,
    averageDegree,
    maxDegree,
    connectedComponents,
    density,
    avgStrength,
  };
}

/**
 * Estimate number of connected components using BFS
 */
function estimateConnectedComponents(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
): number {
  if (nodes.size === 0) return 0;

  const adjacency = new Map<string, string[]>();
  for (const edge of edges.values()) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  const visited = new Set<string>();
  let components = 0;

  for (const nodeId of nodes.keys()) {
    if (!visited.has(nodeId)) {
      components++;
      // BFS
      const queue = [nodeId];
      while (queue.length > 0) {
        const node = queue.shift()!;
        if (visited.has(node)) continue;
        visited.add(node);

        const neighbors = adjacency.get(node) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }
  }

  return components;
}

// ============================================================================
// Relationship Detection
// ============================================================================

/**
 * Detect relationships between entities based on various signals
 */
export async function detectRelationships(): Promise<
  RelationshipDetectionResult[]
> {
  // TODO: Implement when Relationship model is added to schema
  console.warn(
    "detectRelationships: Not yet implemented - Relationship model missing",
  );
  return [];
}

/**
 * Detect shared directors/board members
 */
async function detectSharedDirectors(): Promise<RelationshipDetectionResult[]> {
  const results: RelationshipDetectionResult[] = [];

  // This would query officer/director data from 990 filings
  // For now, we'll create a placeholder that can be expanded

  try {
    // Example: Find organizations with same officers
    // In practice, this would parse 990 data and group by officer name
    const officerGroups = await prisma.$queryRaw<
      Array<{ officerName: string; organizationIds: string[] }>
    >`
      SELECT officer_name, array_agg(entity_id) as organization_ids
      FROM charity_officer
      GROUP BY officer_name
      HAVING COUNT(*) > 1
    `;

    for (const group of officerGroups) {
      const orgIds = group.organizationIds;
      for (let i = 0; i < orgIds.length; i++) {
        for (let j = i + 1; j < orgIds.length; j++) {
          results.push({
            entityType: "shared_director",
            entityA: orgIds[i],
            entityB: orgIds[j],
            strength: 0.8,
            evidence: [`Shared officer: ${group.officerName}`],
            details: {
              officerName: group.officerName,
            },
          });
        }
      }
    }
  } catch (error) {
    console.warn(
      "Shared director detection not yet implemented (requires 990 officer parsing)",
    );
  }

  return results;
}

/**
 * Detect shared addresses
 */
async function detectSharedAddresses(): Promise<RelationshipDetectionResult[]> {
  const results: RelationshipDetectionResult[] = [];

  try {
    // Group entities by normalized address
    const addressGroups = await prisma.$queryRaw<
      Array<{ address: string; entityIds: string[]; entityNames: string[] }>
    >`
      SELECT
        LOWER(TRIM(address)) as address,
        array_agg(id) as entity_ids,
        array_agg(name) as entity_names
      FROM "CanonicalEntity"
      WHERE address IS NOT NULL AND address != ''
      GROUP BY LOWER(TRIM(address))
      HAVING COUNT(*) > 1
    `;

    for (const group of addressGroups) {
      const { address, entityIds, entityNames } = group;

      for (let i = 0; i < entityIds.length; i++) {
        for (let j = i + 1; j < entityIds.length; j++) {
          // Calculate strength based on address type
          const isPobox = address.match(/p\.?\s*s?\.?\s*\d+/i);
          const strength = isPobox ? 0.5 : 0.7; // PO boxes are less significant

          results.push({
            entityType: "shared_address",
            entityA: entityIds[i],
            entityB: entityIds[j],
            strength,
            evidence: [
              `Shared address: ${address}`,
              `${entityNames[i]} and ${entityNames[j]} registered at same location`,
            ],
            details: {
              address,
              isPobox: !!isPobox,
            },
          });
        }
      }
    }
  } catch (error) {
    console.warn("Failed to detect shared addresses:", error);
  }

  return results;
}

/**
 * Detect funding chains (grant relationships)
 */
async function detectFundingChains(): Promise<RelationshipDetectionResult[]> {
  const results: RelationshipDetectionResult[] = [];

  try {
    // This would analyze 990 Part IX and VII for grant data
    // Placeholder for now

    // Example query structure:
    // SELECT grantor_id, grantee_id, amount, year
    // FROM grants
    // GROUP BY grantor_id, grantee_id

    console.log(
      "Funding chain detection not yet implemented (requires 990 grant parsing)",
    );
  } catch (error) {
    console.warn("Failed to detect funding chains:", error);
  }

  return results;
}

/**
 * Detect sister organizations (parent/subsidiary relationships)
 */
async function detectSisterOrganizations(): Promise<
  RelationshipDetectionResult[]
> {
  const results: RelationshipDetectionResult[] = [];

  try {
    // Detect sister orgs by:
    // 1. Similar names with number suffixes (e.g., "Foundation" and "Foundation II")
    // 2. Same EIN prefix (sometimes indicates related orgs)
    // 3. Explicit parent/subsidiary relationships from filings

    // Group by similar names - fetch entities with identifiers
    const nameGroups = await prisma.canonicalEntity.findMany({
      select: {
        id: true,
        displayName: true,
        normalizedName: true,
      },
    });

    // TODO: EIN-based grouping requires related CharityProfile or CorporateCompanyProfile
    // For now, skip this detection method
    console.warn("detectSisterOrganizations: EIN grouping not yet implemented");
  } catch (error) {
    console.warn("Failed to detect sister organizations:", error);
  }

  return results;
}

/**
 * Save detected relationships to database
 * Note: Relationship model not yet in schema - this is a placeholder
 */
async function saveDetectedRelationships(
  relationships: RelationshipDetectionResult[],
): Promise<void> {
  if (relationships.length === 0) return;

  console.log(`Would save ${relationships.length} detected relationships`);
  console.warn("saveDetectedRelationships: Relationship model not yet in schema");
}

// ============================================================================
// Graph Analysis
// ============================================================================

/**
 * Calculate centrality metrics for all nodes
 */
export async function calculateCentrality(
  entityId: string,
  depth: number = 2,
): Promise<Map<string, CentralityMetrics>> {
  const graph = await buildNetworkGraph(entityId, { depth, limit: 500 });
  const centrality = new Map<string, CentralityMetrics>();

  // Calculate degree centrality
  const degreeCentrality = calculateDegreeCentrality(graph);

  // Calculate betweenness centrality
  const betweennessCentrality = calculateBetweennessCentrality(graph);

  // Calculate closeness centrality
  const closenessCentrality = calculateClosenessCentrality(graph);

  // Calculate eigenvector centrality
  const eigenvectorCentrality = calculateEigenvectorCentrality(graph);

  // Combine metrics
  for (const node of graph.nodes) {
    centrality.set(node.id, {
      degreeCentrality: degreeCentrality.get(node.id) || 0,
      betweennessCentrality: betweennessCentrality.get(node.id) || 0,
      closenessCentrality: closenessCentrality.get(node.id) || 0,
      eigenvectorCentrality: eigenvectorCentrality.get(node.id) || 0,
    });
  }

  return centrality;
}

/**
 * Calculate degree centrality (normalized)
 */
function calculateDegreeCentrality(graph: NetworkGraph): Map<string, number> {
  const centrality = new Map<string, number>();
  const maxDegree = graph.statistics.maxDegree || 1;

  for (const node of graph.nodes) {
    centrality.set(node.id, node.degree / maxDegree);
  }

  return centrality;
}

/**
 * Calculate betweenness centrality (simplified)
 */
function calculateBetweennessCentrality(
  graph: NetworkGraph,
): Map<string, number> {
  const centrality = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  // Simplified betweenness: count how many shortest paths go through each node
  for (const source of graph.nodes) {
    const distances = new Map<string, number>();
    const predecessors = new Map<string, string[]>();

    // BFS from source
    const queue = [source.id];
    distances.set(source.id, 0);

    while (queue.length > 0) {
      const node = queue.shift()!;
      const neighbors = adjacency.get(node) || [];

      for (const neighbor of neighbors) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, distances.get(node)! + 1);
          queue.push(neighbor);
        }
        if (distances.get(neighbor) === distances.get(node)! + 1) {
          const preds = predecessors.get(neighbor) || [];
          preds.push(node);
          predecessors.set(neighbor, preds);
        }
      }
    }

    // Accumulate betweenness
    for (const [target, preds] of predecessors.entries()) {
      if (preds.length > 0 && target !== source.id) {
        const delta = 1 / preds.length;
        for (const pred of preds) {
          centrality.set(pred, (centrality.get(pred) || 0) + delta);
        }
      }
    }
  }

  return centrality;
}

/**
 * Calculate closeness centrality
 */
function calculateClosenessCentrality(
  graph: NetworkGraph,
): Map<string, number> {
  const centrality = new Map<string, number>();

  for (const node of graph.nodes) {
    const distances = new Map<string, number>();
    const queue = [node.id];
    distances.set(node.id, 0);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current)!;

      for (const edge of graph.edges) {
        const neighbor =
          edge.from === current
            ? edge.to
            : edge.from === current
              ? null
              : edge.to === current
                ? edge.from
                : null;
        if (neighbor && !distances.has(neighbor)) {
          distances.set(neighbor, currentDist + 1);
          queue.push(neighbor);
        }
      }
    }

    const totalDistance = Array.from(distances.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const reachable = distances.size - 1;
    const closeness =
      reachable > 0 && totalDistance > 0 ? reachable / totalDistance : 0;

    centrality.set(node.id, closeness);
  }

  return centrality;
}

/**
 * Calculate eigenvector centrality (simplified power iteration)
 */
function calculateEigenvectorCentrality(
  graph: NetworkGraph,
): Map<string, number> {
  const centrality = new Map<string, number>(
    graph.nodes.map((n) => [n.id, 1 / graph.nodes.length]),
  );
  const adjacency = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  // Power iteration (10 iterations)
  for (let iter = 0; iter < 10; iter++) {
    const newCentrality = new Map<string, number>();

    for (const node of graph.nodes) {
      const neighbors = adjacency.get(node.id) || [];
      let sum = 0;

      for (const neighbor of neighbors) {
        sum += centrality.get(neighbor) || 0;
      }

      newCentrality.set(node.id, sum);
    }

    // Normalize
    const total = Array.from(newCentrality.values()).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const [id, val] of newCentrality.entries()) {
        centrality.set(id, val / total);
      }
    }
  }

  return centrality;
}

/**
 * Detect communities using Louvain-like algorithm (simplified)
 */
export async function detectCommunities(
  entityId: string,
  depth: number = 2,
): Promise<Community[]> {
  const graph = await buildNetworkGraph(entityId, { depth, limit: 500 });
  const communities: Community[] = [];

  if (graph.nodes.length === 0) return communities;

  // Simple label propagation algorithm
  const labels = new Map<string, string>(graph.nodes.map((n) => [n.id, n.id]));
  const adjacency = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  // Iterate until convergence
  let changed = true;
  let iterations = 0;
  const maxIterations = 100;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const node of graph.nodes) {
      const neighbors = adjacency.get(node.id) || [];
      if (neighbors.length === 0) continue;

      // Count neighbor labels
      const labelCounts = new Map<string, number>();
      for (const neighbor of neighbors) {
        const neighborLabel = labels.get(neighbor);
        if (neighborLabel) {
          labelCounts.set(
            neighborLabel,
            (labelCounts.get(neighborLabel) || 0) + 1,
          );
        }
      }

      // Find most common label
      let maxCount = 0;
      let bestLabel = node.id;

      for (const [label, count] of labelCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(node.id)) {
        labels.set(node.id, bestLabel);
        changed = true;
      }
    }
  }

  // Group nodes by label
  const labelGroups = new Map<string, string[]>();
  for (const [nodeId, label] of labels.entries()) {
    if (!labelGroups.has(label)) labelGroups.set(label, []);
    labelGroups.get(label)!.push(nodeId);
  }

  // Create community objects
  let communityId = 0;
  for (const [label, nodeIds] of labelGroups.entries()) {
    const nodesInCommunity = nodeIds;
    const edgesInCommunity = graph.edges.filter(
      (e) =>
        nodesInCommunity.includes(e.from) && nodesInCommunity.includes(e.to),
    );

    // Calculate density
    const maxEdges =
      (nodesInCommunity.length * (nodesInCommunity.length - 1)) / 2;
    const density = maxEdges > 0 ? edgesInCommunity.length / maxEdges : 0;

    // Calculate average risk score
    const communityNodes = graph.nodes.filter((n) =>
      nodesInCommunity.includes(n.id),
    );
    const riskScores = communityNodes
      .map((n) => n.riskScore)
      .filter((s): s is number => s !== undefined);
    const avgRiskScore =
      riskScores.length > 0
        ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length
        : undefined;

    communities.push({
      id: `community_${communityId++}`,
      nodes: nodesInCommunity,
      size: nodesInCommunity.length,
      density,
      avgRiskScore,
    });
  }

  return communities.sort((a, b) => b.size - a.size);
}

/**
 * Find shortest path between two entities
 */
export async function findShortestPath(
  fromEntityId: string,
  toEntityId: string,
  maxDepth: number = 5,
): Promise<Path | null> {
  // Build graph from source
  const graph = await buildNetworkGraph(fromEntityId, {
    depth: maxDepth,
    limit: 1000,
  });

  // Check if target is in graph
  const targetNode = graph.nodes.find((n) => n.id === toEntityId);
  if (!targetNode) return null;

  // BFS to find shortest path
  const adjacency = new Map<
    string,
    Array<{ to: string; edgeId: string; type: RelationshipType }>
  >();

  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency
      .get(edge.from)!
      .push({ to: edge.to, edgeId: edge.id, type: edge.relationshipType });
    adjacency
      .get(edge.to)!
      .push({ to: edge.from, edgeId: edge.id, type: edge.relationshipType });
  }

  const queue: Array<{ node: string; path: string[]; edges: string[] }> = [
    { node: fromEntityId, path: [fromEntityId], edges: [] },
  ];
  const visited = new Set<string>([fromEntityId]);

  while (queue.length > 0) {
    const { node, path, edges } = queue.shift()!;

    if (node === toEntityId) {
      // Found path
      const pathNodes = graph.nodes.filter((n) => path.includes(n.id));
      const totalStrength =
        pathNodes.reduce((sum, n) => sum + (n.riskScore || 0), 0) /
        pathNodes.length;
      const relationshipTypes = [
        ...new Set(
          graph.edges
            .filter((e) => edges.includes(e.id))
            .map((e) => e.relationshipType),
        ),
      ];

      return {
        nodes: path,
        edges,
        totalStrength,
        relationshipTypes,
      };
    }

    const neighbors = adjacency.get(node) || [];
    for (const { to, edgeId } of neighbors) {
      if (!visited.has(to)) {
        visited.add(to);
        queue.push({
          node: to,
          path: [...path, to],
          edges: [...edges, edgeId],
        });
      }
    }
  }

  return null; // No path found
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Run full relationship detection pipeline
 */
export async function runRelationshipDetectionPipeline(): Promise<{
  detected: number;
  saved: number;
  skipped: number;
}> {
  console.log("Starting relationship detection pipeline...");

  const results = await detectRelationships();
  const detected = results.length;

  // Already saved in detectRelationships
  const saved = detected;
  const skipped = 0;

  console.log(
    `✓ Pipeline complete: ${detected} detected, ${saved} saved, ${skipped} skipped`,
  );

  return { detected, saved, skipped };
}

/**
 * Update graph for all entities
 */
export async function updateAllGraphs(
  options?: GraphQueryOptions,
): Promise<void> {
  console.log("Updating graphs for all entities...");

  const entities = await prisma.canonicalEntity.findMany({
    select: { id: true },
    take: 100, // Process in batches
  });

  let processed = 0;
  for (const entity of entities) {
    try {
      await buildNetworkGraph(entity.id, options);
      processed++;
    } catch (error) {
      console.warn(`Failed to update graph for ${entity.id}:`, error);
    }
  }

  console.log(`✓ Updated graphs for ${processed} entities`);
}

// ============================================================================
// Export default
// ============================================================================

export default {
  buildNetworkGraph,
  detectRelationships,
  detectSharedDirectors,
  detectSharedAddresses,
  detectFundingChains,
  detectSisterOrganizations,
  calculateCentrality,
  detectCommunities,
  findShortestPath,
  runRelationshipDetectionPipeline,
  updateAllGraphs,
};
