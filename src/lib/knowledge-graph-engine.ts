import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export type EntityType = 'concept' | 'person' | 'project' | 'technology' | 'domain' | 'resource' | 'event';
export type RelationType = 'depends_on' | 'related_to' | 'part_of' | 'owns' | 'uses' | 'produces' | 'blocks' | 'supports';
export type TraversalDirection = 'outgoing' | 'incoming' | 'both';

/** Entity with parsed properties */
export interface KnowledgeEntityResult {
  id: string;
  name: string;
  entityType: string;
  description?: string;
  properties: Record<string, unknown>;
  confidence: number;
  sourceId?: string;
  sourceType?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Relation with parsed properties */
export interface KnowledgeRelationResult {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  properties: Record<string, unknown>;
  weight: number;
  bidirectional: boolean;
  confidence: number;
  createdAt: Date;
}

/** Traversal result — a collection of entities and relations */
export interface TraversalResult {
  entities: KnowledgeEntityResult[];
  relations: KnowledgeRelationResult[];
  depth: number;
}

/** Path between two entities */
export interface PathResult {
  found: boolean;
  path: Array<{
    entity: KnowledgeEntityResult;
    relation?: KnowledgeRelationResult;
  }>;
  totalWeight: number;
  length: number;
}

/** Neighborhood of an entity */
export interface NeighborhoodResult {
  center: KnowledgeEntityResult;
  entities: KnowledgeEntityResult[];
  relations: KnowledgeRelationResult[];
  depth: number;
}

/** Subgraph extraction result */
export interface SubgraphResult {
  entities: KnowledgeEntityResult[];
  relations: KnowledgeRelationResult[];
  entityCount: number;
  relationCount: number;
}

/** Graph statistics */
export interface GraphStats {
  totalEntities: number;
  totalRelations: number;
  entityTypeDistribution: Record<string, number>;
  relationTypeDistribution: Record<string, number>;
  avgDegree: number;
  density: number;
  topConnectedEntities: Array<{ id: string; name: string; degree: number }>;
  bidirectionalCount: number;
}

/** Filter for listing entities */
export interface EntityFilter {
  entityType?: string;
  sourceType?: string;
  minConfidence?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Filter for listing relations */
export interface RelationFilter {
  relationType?: string;
  sourceId?: string;
  targetId?: string;
  minWeight?: number;
  minConfidence?: number;
  bidirectional?: boolean;
  limit?: number;
  offset?: number;
}

/** Auto-extracted entity from text */
interface ExtractedEntity {
  name: string;
  entityType: EntityType;
  description?: string;
  properties?: Record<string, unknown>;
}

/** Auto-extracted relation from text */
interface ExtractedRelation {
  sourceName: string;
  targetName: string;
  relationType: RelationType;
  weight?: number;
}

// ============================================================
// Helpers
// ============================================================

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function entityToResult(entity: {
  id: string;
  name: string;
  entityType: string;
  description: string | null;
  properties: string;
  confidence: number;
  sourceId: string | null;
  sourceType: string | null;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeEntityResult {
  return {
    id: entity.id,
    name: entity.name,
    entityType: entity.entityType,
    description: entity.description ?? undefined,
    properties: parseJsonSafe<Record<string, unknown>>(entity.properties, {}),
    confidence: entity.confidence,
    sourceId: entity.sourceId ?? undefined,
    sourceType: entity.sourceType ?? undefined,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function relationToResult(relation: {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  properties: string;
  weight: number;
  bidirectional: boolean;
  confidence: number;
  createdAt: Date;
}): KnowledgeRelationResult {
  return {
    id: relation.id,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    relationType: relation.relationType,
    properties: parseJsonSafe<Record<string, unknown>>(relation.properties, {}),
    weight: relation.weight,
    bidirectional: relation.bidirectional,
    confidence: relation.confidence,
    createdAt: relation.createdAt,
  };
}

// ============================================================
// Core Engine — exported async functions
// ============================================================

/**
 * Create a new knowledge entity.
 */
export async function createEntity(
  name: string,
  entityType: EntityType,
  description?: string,
  properties?: Record<string, unknown>,
  sourceId?: string,
  sourceType?: string
): Promise<KnowledgeEntityResult> {
  try {
    const entity = await db.knowledgeEntity.create({
      data: {
        name,
        entityType,
        description: description ?? null,
        properties: JSON.stringify(properties ?? {}),
        confidence: 1.0,
        sourceId: sourceId ?? null,
        sourceType: sourceType ?? null,
      },
    });

    return entityToResult(entity);
  } catch (error: unknown) {
    throw new Error(`Failed to create entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update an existing entity.
 */
export async function updateEntity(
  entityId: string,
  updates: {
    name?: string;
    entityType?: string;
    description?: string;
    properties?: Record<string, unknown>;
    confidence?: number;
  }
): Promise<KnowledgeEntityResult> {
  try {
    const data: Record<string, unknown> = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.entityType !== undefined) data.entityType = updates.entityType;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.confidence !== undefined) data.confidence = updates.confidence;

    // Merge properties if provided
    if (updates.properties !== undefined) {
      const existing = await db.knowledgeEntity.findUnique({ where: { id: entityId } });
      const existingProps = parseJsonSafe<Record<string, unknown>>(existing?.properties, {});
      data.properties = JSON.stringify({ ...existingProps, ...updates.properties });
    }

    const entity = await db.knowledgeEntity.update({
      where: { id: entityId },
      data,
    });

    return entityToResult(entity);
  } catch (error: unknown) {
    throw new Error(`Failed to update entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete an entity and all its relations.
 */
export async function deleteEntity(entityId: string): Promise<{
  deletedEntity: string;
  deletedRelations: number;
}> {
  try {
    // Delete all relations involving this entity
    const deletedSource = await db.knowledgeRelation.deleteMany({
      where: { sourceId: entityId },
    });

    const deletedTarget = await db.knowledgeRelation.deleteMany({
      where: { targetId: entityId },
    });

    // Delete the entity itself
    await db.knowledgeEntity.delete({
      where: { id: entityId },
    });

    return {
      deletedEntity: entityId,
      deletedRelations: deletedSource.count + deletedTarget.count,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to delete entity: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a typed, weighted, directional relation between two entities.
 */
export async function createRelation(
  sourceId: string,
  targetId: string,
  relationType: RelationType,
  weight: number = 1.0,
  bidirectional: boolean = false,
  properties?: Record<string, unknown>
): Promise<KnowledgeRelationResult> {
  try {
    // Verify both entities exist
    const source = await db.knowledgeEntity.findUnique({ where: { id: sourceId } });
    const target = await db.knowledgeEntity.findUnique({ where: { id: targetId } });

    if (!source) throw new Error(`Source entity not found: ${sourceId}`);
    if (!target) throw new Error(`Target entity not found: ${targetId}`);

    const relation = await db.knowledgeRelation.create({
      data: {
        sourceId,
        targetId,
        relationType,
        weight,
        bidirectional,
        confidence: 1.0,
        properties: JSON.stringify(properties ?? {}),
      },
    });

    // If bidirectional, create the reverse relation too
    if (bidirectional) {
      await db.knowledgeRelation.create({
        data: {
          sourceId: targetId,
          targetId: sourceId,
          relationType,
          weight,
          bidirectional: true,
          confidence: 1.0,
          properties: JSON.stringify(properties ?? {}),
        },
      });
    }

    return relationToResult(relation);
  } catch (error: unknown) {
    throw new Error(`Failed to create relation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a relation.
 */
export async function deleteRelation(relationId: string): Promise<{
  deletedRelation: string;
}> {
  try {
    await db.knowledgeRelation.delete({
      where: { id: relationId },
    });

    return { deletedRelation: relationId };
  } catch (error: unknown) {
    throw new Error(`Failed to delete relation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Traverse the graph from a starting entity using BFS or DFS.
 */
export async function traverse(
  entityId: string,
  direction: TraversalDirection = 'both',
  depth: number = 2,
  relationTypes?: RelationType[]
): Promise<TraversalResult> {
  try {
    const visitedEntities = new Set<string>([entityId]);
    const visitedRelations = new Set<string>();
    const entityResults: KnowledgeEntityResult[] = [];
    const relationResults: KnowledgeRelationResult[] = [];

    // Add the starting entity
    const startEntity = await db.knowledgeEntity.findUnique({ where: { id: entityId } });
    if (!startEntity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    entityResults.push(entityToResult(startEntity));

    // BFS traversal
    let currentLevel = [entityId];

    for (let d = 0; d < depth; d++) {
      const nextLevel: string[] = [];

      for (const currentId of currentLevel) {
        // Find relations from/to this entity
        const whereConditions: Record<string, unknown>[] = [];

        if (direction === 'outgoing' || direction === 'both') {
          whereConditions.push({ sourceId: currentId });
        }
        if (direction === 'incoming' || direction === 'both') {
          whereConditions.push({ targetId: currentId });
        }

        for (const condition of whereConditions) {
          const filter: Record<string, unknown> = { ...condition };
          if (relationTypes && relationTypes.length > 0) {
            filter.relationType = { in: relationTypes };
          }

          const relations = await db.knowledgeRelation.findMany({
            where: filter as never,
          });

          for (const rel of relations) {
            if (visitedRelations.has(rel.id)) continue;
            visitedRelations.add(rel.id);

            relationResults.push(relationToResult(rel));

            // Get the connected entity
            const connectedId = rel.sourceId === currentId ? rel.targetId : rel.sourceId;
            if (!visitedEntities.has(connectedId)) {
              visitedEntities.add(connectedId);
              const connectedEntity = await db.knowledgeEntity.findUnique({
                where: { id: connectedId },
              });
              if (connectedEntity) {
                entityResults.push(entityToResult(connectedEntity));
                nextLevel.push(connectedId);
              }
            }
          }
        }
      }

      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    return {
      entities: entityResults,
      relations: relationResults,
      depth,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to traverse graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Find the shortest path between two entities using BFS.
 */
export async function findPath(
  fromId: string,
  toId: string,
  maxDepth: number = 6
): Promise<PathResult> {
  try {
    if (fromId === toId) {
      const entity = await db.knowledgeEntity.findUnique({ where: { id: fromId } });
      return {
        found: true,
        path: [{ entity: entityToResult(entity!) }],
        totalWeight: 0,
        length: 0,
      };
    }

    // BFS with path tracking
    const visited = new Set<string>([fromId]);
    const queue: Array<{
      entityId: string;
      path: Array<{ entity: KnowledgeEntityResult; relation?: KnowledgeRelationResult }>;
      totalWeight: number;
    }> = [];

    const startEntity = await db.knowledgeEntity.findUnique({ where: { id: fromId } });
    if (!startEntity) throw new Error(`Entity not found: ${fromId}`);

    queue.push({
      entityId: fromId,
      path: [{ entity: entityToResult(startEntity) }],
      totalWeight: 0,
    });

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length - 1 >= maxDepth) continue;

      // Find all relations from/to this entity
      const relations = await db.knowledgeRelation.findMany({
        where: {
          OR: [
            { sourceId: current.entityId },
            { targetId: current.entityId },
          ],
        },
      });

      for (const rel of relations) {
        const connectedId = rel.sourceId === current.entityId ? rel.targetId : rel.sourceId;

        if (visited.has(connectedId)) continue;
        visited.add(connectedId);

        const connectedEntity = await db.knowledgeEntity.findUnique({
          where: { id: connectedId },
        });

        if (!connectedEntity) continue;

        const newPath = [
          ...current.path,
          {
            entity: entityToResult(connectedEntity),
            relation: relationToResult(rel),
          },
        ];

        if (connectedId === toId) {
          return {
            found: true,
            path: newPath,
            totalWeight: current.totalWeight + rel.weight,
            length: newPath.length - 1,
          };
        }

        queue.push({
          entityId: connectedId,
          path: newPath,
          totalWeight: current.totalWeight + rel.weight,
        });
      }
    }

    return {
      found: false,
      path: [],
      totalWeight: 0,
      length: 0,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to find path: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get the neighborhood of an entity (all directly related entities).
 */
export async function getNeighborhood(
  entityId: string,
  depth: number = 1
): Promise<NeighborhoodResult> {
  try {
    const centerEntity = await db.knowledgeEntity.findUnique({
      where: { id: entityId },
    });

    if (!centerEntity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const traversalResult = await traverse(entityId, 'both', depth);

    return {
      center: entityToResult(centerEntity),
      entities: traversalResult.entities.filter((e) => e.id !== entityId),
      relations: traversalResult.relations,
      depth,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to get neighborhood: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract a subgraph containing the specified entities and their interrelations.
 */
export async function extractSubgraph(entityIds: string[]): Promise<SubgraphResult> {
  try {
    const entities: KnowledgeEntityResult[] = [];
    const relations: KnowledgeRelationResult[] = [];
    const entityIdSet = new Set(entityIds);

    // Fetch all specified entities
    for (const id of entityIds) {
      const entity = await db.knowledgeEntity.findUnique({ where: { id } });
      if (entity) {
        entities.push(entityToResult(entity));
      }
    }

    // Find all relations between these entities
    for (const sourceId of entityIds) {
      const rels = await db.knowledgeRelation.findMany({
        where: { sourceId },
      });

      for (const rel of rels) {
        if (entityIdSet.has(rel.targetId)) {
          relations.push(relationToResult(rel));
        }
      }
    }

    return {
      entities,
      relations,
      entityCount: entities.length,
      relationCount: relations.length,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to extract subgraph: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search entities by name, type, or semantic similarity.
 */
export async function searchEntities(
  query: string,
  entityType?: EntityType,
  limit: number = 20
): Promise<KnowledgeEntityResult[]> {
  try {
    const where: Record<string, unknown> = {
      OR: [
        { name: { contains: query } },
        { description: { contains: query } },
      ],
    };

    if (entityType) {
      where.entityType = entityType;
      where.AND = where.OR ? [{ OR: where.OR }, { entityType }] : undefined;
      delete where.OR;
      where.OR = [
        { name: { contains: query } },
        { description: { contains: query } },
      ];
      // Simpler approach: just filter by type and search
    }

    // Simple text search
    let results;
    if (entityType) {
      results = await db.knowledgeEntity.findMany({
        where: {
          entityType,
          OR: [
            { name: { contains: query } },
            { description: { contains: query } },
          ],
        },
        take: limit,
        orderBy: { confidence: 'desc' },
      });
    } else {
      results = await db.knowledgeEntity.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { description: { contains: query } },
          ],
        },
        take: limit,
        orderBy: { confidence: 'desc' },
      });
    }

    // Score results by relevance
    const scored = results.map((entity) => {
      let relevanceScore = 0;
      const nameLower = entity.name.toLowerCase();
      const queryLower = query.toLowerCase();

      // Exact name match
      if (nameLower === queryLower) relevanceScore += 10;
      // Name starts with query
      else if (nameLower.startsWith(queryLower)) relevanceScore += 5;
      // Name contains query
      else if (nameLower.includes(queryLower)) relevanceScore += 3;
      // Description contains query
      if (entity.description?.toLowerCase().includes(queryLower)) relevanceScore += 1;

      // Boost by confidence
      relevanceScore += entity.confidence;

      return { entity, relevanceScore };
    });

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return scored.map((s) => entityToResult(s.entity));
  } catch (error: unknown) {
    throw new Error(`Failed to search entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get graph statistics (density, centrality, etc.).
 */
export async function getGraphStats(): Promise<GraphStats> {
  try {
    const totalEntities = await db.knowledgeEntity.count();
    const totalRelations = await db.knowledgeRelation.count();

    // Entity type distribution
    const entityTypes = await db.knowledgeEntity.findMany({
      select: { entityType: true },
    });
    const entityTypeDistribution: Record<string, number> = {};
    for (const e of entityTypes) {
      entityTypeDistribution[e.entityType] = (entityTypeDistribution[e.entityType] ?? 0) + 1;
    }

    // Relation type distribution
    const relationTypes = await db.knowledgeRelation.findMany({
      select: { relationType: true },
    });
    const relationTypeDistribution: Record<string, number> = {};
    for (const r of relationTypes) {
      relationTypeDistribution[r.relationType] = (relationTypeDistribution[r.relationType] ?? 0) + 1;
    }

    // Bidirectional count
    const bidirectionalCount = await db.knowledgeRelation.count({
      where: { bidirectional: true },
    });

    // Calculate degree for each entity
    const degreeMap: Record<string, number> = {};
    const nameMap: Record<string, string> = {};

    // Source degrees
    const sourceDegrees = await db.knowledgeRelation.groupBy({
      by: ['sourceId'],
      _count: { id: true },
    });
    for (const sd of sourceDegrees) {
      degreeMap[sd.sourceId] = (degreeMap[sd.sourceId] ?? 0) + sd._count.id;
    }

    // Target degrees
    const targetDegrees = await db.knowledgeRelation.groupBy({
      by: ['targetId'],
      _count: { id: true },
    });
    for (const td of targetDegrees) {
      degreeMap[td.targetId] = (degreeMap[td.targetId] ?? 0) + td._count.id;
    }

    // Fetch names for top entities
    const topEntityIds = Object.entries(degreeMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([id]) => id);

    if (topEntityIds.length > 0) {
      const topEntities = await db.knowledgeEntity.findMany({
        where: { id: { in: topEntityIds } },
        select: { id: true, name: true },
      });
      for (const te of topEntities) {
        nameMap[te.id] = te.name;
      }
    }

    const topConnectedEntities = topEntityIds.map((id) => ({
      id,
      name: nameMap[id] ?? 'Unknown',
      degree: degreeMap[id] ?? 0,
    }));

    // Average degree
    const totalDegree = Object.values(degreeMap).reduce((sum, d) => sum + d, 0);
    const avgDegree = totalEntities > 0 ? totalDegree / totalEntities : 0;

    // Graph density: 2 * |E| / (|V| * (|V| - 1))
    const density = totalEntities > 1
      ? (2 * totalRelations) / (totalEntities * (totalEntities - 1))
      : 0;

    return {
      totalEntities,
      totalRelations,
      entityTypeDistribution,
      relationTypeDistribution,
      avgDegree,
      density,
      topConnectedEntities,
      bidirectionalCount,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to get graph stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Auto-extract entities and relations from text.
 * Uses simple pattern matching and heuristics.
 */
export async function extractFromText(
  text: string,
  sourceId?: string,
  sourceType?: string
): Promise<{
  entities: KnowledgeEntityResult[];
  relations: KnowledgeRelationResult[];
  extractedCount: number;
}> {
  try {
    const extractedEntities: ExtractedEntity[] = [];
    const extractedRelations: ExtractedRelation[] = [];

    // Simple entity extraction patterns
    const patterns: Array<{
      regex: RegExp;
      entityType: EntityType;
      relationType?: RelationType;
    }> = [
      // "X depends on Y"
      { regex: /(\w[\w\s-]*?)\s+depends?\s+on\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'concept', relationType: 'depends_on' },
      // "X uses Y"
      { regex: /(\w[\w\s-]*?)\s+uses?\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'technology', relationType: 'uses' },
      // "X produces Y"
      { regex: /(\w[\w\s-]*?)\s+produces?\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'resource', relationType: 'produces' },
      // "X is part of Y"
      { regex: /(\w[\w\s-]*?)\s+is\s+(?:a\s+)?part\s+of\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'concept', relationType: 'part_of' },
      // "X owns Y"
      { regex: /(\w[\w\s-]*?)\s+owns?\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'person', relationType: 'owns' },
      // "X blocks Y"
      { regex: /(\w[\w\s-]*?)\s+blocks?\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'concept', relationType: 'blocks' },
      // "X supports Y"
      { regex: /(\w[\w\s-]*?)\s+supports?\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'concept', relationType: 'supports' },
      // "X is related to Y"
      { regex: /(\w[\w\s-]*?)\s+(?:is\s+)?related\s+to\s+(\w[\w\s-]*?)(?:[.,;]|$)/gi, entityType: 'concept', relationType: 'related_to' },
    ];

    const entityNameMap = new Map<string, EntityType>();

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

      while ((match = regex.exec(text)) !== null) {
        const sourceName = match[1].trim();
        const targetName = match[2].trim();

        if (sourceName.length > 1 && targetName.length > 1) {
          entityNameMap.set(sourceName, pattern.entityType);
          entityNameMap.set(targetName, pattern.entityType);

          extractedEntities.push({
            name: sourceName,
            entityType: pattern.entityType,
            description: `Extracted from text`,
          });

          extractedEntities.push({
            name: targetName,
            entityType: pattern.entityType,
            description: `Extracted from text`,
          });

          if (pattern.relationType) {
            extractedRelations.push({
              sourceName,
              targetName,
              relationType: pattern.relationType,
              weight: 0.7,
            });
          }
        }
      }
    }

    // Deduplicate entities
    const uniqueEntityNames = new Set<string>();
    const uniqueEntities: ExtractedEntity[] = [];
    for (const entity of extractedEntities) {
      if (!uniqueEntityNames.has(entity.name)) {
        uniqueEntityNames.add(entity.name);
        uniqueEntities.push(entity);
      }
    }

    // Create entities in DB
    const createdEntities: KnowledgeEntityResult[] = [];
    const entityNameToId = new Map<string, string>();

    for (const extEntity of uniqueEntities) {
      try {
        // Check if entity already exists
        const existing = await db.knowledgeEntity.findFirst({
          where: { name: extEntity.name, entityType: extEntity.entityType },
        });

        if (existing) {
          entityNameToId.set(extEntity.name, existing.id);
          createdEntities.push(entityToResult(existing));
        } else {
          const entity = await db.knowledgeEntity.create({
            data: {
              name: extEntity.name,
              entityType: extEntity.entityType,
              description: extEntity.description ?? null,
              properties: JSON.stringify(extEntity.properties ?? {}),
              confidence: 0.7, // Auto-extracted entities have lower confidence
              sourceId: sourceId ?? null,
              sourceType: sourceType ?? 'auto_extract',
            },
          });

          entityNameToId.set(extEntity.name, entity.id);
          createdEntities.push(entityToResult(entity));
        }
      } catch {
        // Skip if creation fails (e.g., duplicate)
      }
    }

    // Create relations in DB
    const createdRelations: KnowledgeRelationResult[] = [];
    const uniqueRelationKeys = new Set<string>();

    for (const extRel of extractedRelations) {
      const sourceEntityId = entityNameToId.get(extRel.sourceName);
      const targetEntityId = entityNameToId.get(extRel.targetName);

      if (!sourceEntityId || !targetEntityId) continue;

      const relationKey = `${sourceEntityId}-${extRel.relationType}-${targetEntityId}`;
      if (uniqueRelationKeys.has(relationKey)) continue;
      uniqueRelationKeys.add(relationKey);

      try {
        const relation = await db.knowledgeRelation.create({
          data: {
            sourceId: sourceEntityId,
            targetId: targetEntityId,
            relationType: extRel.relationType,
            weight: extRel.weight ?? 0.7,
            bidirectional: false,
            confidence: 0.7,
            properties: JSON.stringify({}),
          },
        });

        createdRelations.push(relationToResult(relation));
      } catch {
        // Skip if creation fails
      }
    }

    return {
      entities: createdEntities,
      relations: createdRelations,
      extractedCount: createdEntities.length + createdRelations.length,
    };
  } catch (error: unknown) {
    throw new Error(`Failed to extract from text: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List entities with optional filter.
 */
export async function listEntities(filter?: EntityFilter): Promise<KnowledgeEntityResult[]> {
  try {
    const where: Record<string, unknown> = {};

    if (filter?.entityType) where.entityType = filter.entityType;
    if (filter?.sourceType) where.sourceType = filter.sourceType;
    if (filter?.minConfidence !== undefined) where.confidence = { gte: filter.minConfidence };
    if (filter?.search) {
      where.OR = [
        { name: { contains: filter.search } },
        { description: { contains: filter.search } },
      ];
    }

    const entities = await db.knowledgeEntity.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });

    return entities.map(entityToResult);
  } catch (error: unknown) {
    throw new Error(`Failed to list entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List relations with optional filter.
 */
export async function listRelations(filter?: RelationFilter): Promise<KnowledgeRelationResult[]> {
  try {
    const where: Record<string, unknown> = {};

    if (filter?.relationType) where.relationType = filter.relationType;
    if (filter?.sourceId) where.sourceId = filter.sourceId;
    if (filter?.targetId) where.targetId = filter.targetId;
    if (filter?.minWeight !== undefined) where.weight = { gte: filter.minWeight };
    if (filter?.minConfidence !== undefined) where.confidence = { gte: filter.minConfidence };
    if (filter?.bidirectional !== undefined) where.bidirectional = filter.bidirectional;

    const relations = await db.knowledgeRelation.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });

    return relations.map(relationToResult);
  } catch (error: unknown) {
    throw new Error(`Failed to list relations: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
