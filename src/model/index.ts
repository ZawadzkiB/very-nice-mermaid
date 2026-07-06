/**
 * Core model types shared by every module (parser → layout → renderers).
 *
 * Everything here is plain data so it round-trips through JSON for the
 * standalone HTML export. The one exception is {@link DiagramModel.classDefs},
 * a `Map` — {@link serializeModel} / {@link deserializeModel} handle that.
 *
 * Positioned coordinates are **center-based**: a node's `x`/`y` is the middle of
 * its card, and `width`/`height` are its full extents. Geometry and renderers
 * rely on this convention.
 */

/** Flow direction. `TD` is an alias for `TB` (mermaid accepts both). */
export type Direction = "TB" | "TD" | "BT" | "LR" | "RL";

/** Supported node shapes (mermaid flowchart v1 surface). */
export type Shape =
  | "rect" // [ ]
  | "rounded" // ( )
  | "stadium" // ([ ])
  | "subroutine" // [[ ]]
  | "circle" // (( ))
  | "diamond" // { }
  | "hexagon" // {{ }}
  | "parallelogram" // [/ /]
  | "parallelogram-alt" // [\ \]
  | "cylinder"; // [( )]

/**
 * Edge line style plus the "has an arrowhead" distinction for solid lines:
 * `solid` = solid line with an arrow (`-->`), `open` = solid line, no arrow
 * (`---`), `dotted` = `-.->`, `thick` = `==>`. Arrowhead presence for every
 * kind is tracked separately in {@link DiagramEdge.arrows}.
 */
export type EdgeKind = "solid" | "open" | "dotted" | "thick";

/** Which ends of an edge carry an arrowhead. */
export interface ArrowEnds {
  start: boolean;
  end: boolean;
}

/** A CSS-ish style bag (from `classDef` / `style` / theme roles). */
export interface StyleDef {
  fill?: string;
  stroke?: string;
  color?: string;
  strokeWidth?: string;
  strokeDasharray?: string;
  /** Unrecognized `key:value` pairs are preserved verbatim. */
  [key: string]: string | undefined;
}

/** Severity of a diagnostic emitted while parsing. */
export type Severity = "warning" | "error";

/** A structured parse/validation message that always carries a source position. */
export interface Diagnostic {
  severity: Severity;
  /** Stable machine code, e.g. `unknown-statement`, `unterminated-shape`. */
  code: string;
  message: string;
  /** 1-based line number in the source DSL. */
  line: number;
  /** 1-based column number in the source DSL. */
  col: number;
}

/** A node as parsed (no geometry yet). */
export interface DiagramNode {
  id: string;
  label: string;
  shape: Shape;
  /** classDef / `class` / `:::` class names applied, in application order. */
  classes: string[];
  /** Inline `style id ...` override, if any. */
  style?: StyleDef;
}

/** An edge as parsed (no geometry yet). */
export interface DiagramEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  arrows: ArrowEnds;
  /** Number of line characters (`--` = 2). Feeds layout rank spacing. */
  length: number;
}

/** A `subgraph … end` cluster. Children are node ids and nested subgraph ids. */
export interface Subgraph {
  id: string;
  title: string;
  children: string[];
  /** Optional per-cluster `direction` override. */
  direction?: Direction;
}

/** The parsed, unpositioned diagram. */
export interface DiagramModel {
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  subgraphs: Subgraph[];
  classDefs: Map<string, StyleDef>;
  warnings: Diagnostic[];
}

/** A 2D point. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned rectangle (top-left origin, positive extents). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A node with layout geometry (center-based `x`/`y`). */
export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An edge routed through concrete waypoints. */
export interface RoutedEdge extends DiagramEdge {
  /** Ordered polyline waypoints (elbow) or bezier sample knots (curved). */
  points: Point[];
  /** SVG path `d` string (`L…` for elbow, `C…` for curved). */
  path: string;
  /**
   * Interior detour waypoints from dagre's own multi-rank routing (absolute
   * coords, dagre's border-attach endpoints stripped). Present only for edges
   * that span intervening ranks; the renderers thread the route through these
   * so multi-rank / back edges skirt node boxes instead of cutting straight
   * through them. Kept on the edge so the live DOM runtime can re-route from
   * the same detour while dragging.
   */
  waypoints?: Point[];
  /**
   * Resolved **perimeter anchors** for the two endpoints: which border `side`
   * each end attaches to (chosen by the direction to the other node) and the
   * `offset` that slides it along that side so multiple edges sharing a border
   * stay on distinct channels — fixes anti-parallel edges fully occluding and a
   * relation marker bleeding onto sibling edges at a shared trunk, and lets a
   * hub's connections fan out across the whole perimeter (FR2). Baked at layout
   * time; re-routers (`applyPositions`, the state pseudo-state shrink) and the
   * live DOM runtime **recompute** it from the current node boxes so a drag /
   * resize re-distributes cleanly. `labelShift` additionally staggers the label
   * plate so several edges between the same node pair don't stack (TEST-006).
   */
  ports?: {
    source: { side: "top" | "bottom" | "left" | "right"; offset: number };
    target: { side: "top" | "bottom" | "left" | "right"; offset: number };
    labelShift?: Point;
  };
  /** Where the edge label plate is centered, if there is a label. */
  labelPos?: Point;
}

/** A subgraph with its computed bounding box (center-based `x`/`y`). */
export interface PositionedSubgraph extends Subgraph {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The fully positioned diagram every renderer consumes. */
export interface PositionedModel {
  direction: Direction;
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  subgraphs: PositionedSubgraph[];
  classDefs: Map<string, StyleDef>;
  bounds: Rect;
}

/** JSON-friendly shape of a {@link PositionedModel} (classDefs as an object). */
export interface SerializedModel {
  direction: Direction;
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  subgraphs: PositionedSubgraph[];
  classDefs: Record<string, StyleDef>;
  bounds: Rect;
}

/** Convert a {@link PositionedModel} to a plain JSON-safe object. */
export function serializeModel(model: PositionedModel): SerializedModel {
  const classDefs: Record<string, StyleDef> = {};
  for (const [name, def] of model.classDefs) classDefs[name] = def;
  return {
    direction: model.direction,
    nodes: model.nodes,
    edges: model.edges,
    subgraphs: model.subgraphs,
    classDefs,
    bounds: model.bounds,
  };
}

/** Rebuild a {@link PositionedModel} from its serialized form. */
export function deserializeModel(data: SerializedModel): PositionedModel {
  return {
    direction: data.direction,
    nodes: data.nodes,
    edges: data.edges,
    subgraphs: data.subgraphs,
    classDefs: new Map(Object.entries(data.classDefs)),
    bounds: data.bounds,
  };
}

/** Type guard: does this value already carry layout geometry? */
export function isPositionedModel(
  value: DiagramModel | PositionedModel,
): value is PositionedModel {
  return "bounds" in value && (value as PositionedModel).bounds !== undefined;
}
