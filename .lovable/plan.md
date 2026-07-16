# Editable Spline — sub-object selection and editing for Shapes

Goal: turn every shape (Line, Rectangle, Circle, Ellipse, Arc, Donut, NGon, Star, Helix, Text) into a spline whose **Vertex / Segment / Spline** sub-objects can be selected, transformed and edited directly in the viewport — matching 3ds Max's Editable Spline / Edit Spline panel.

Today shapes are purely parametric (`buildShape` in `utils/extendedGeometry.ts`) and expose properties in `ShapeParametersPanel`, but there is no way to click a vertex, drag a segment or change a knot's tangent type. This plan adds that layer while keeping the existing parametric flow untouched until the user opts in.

## User-facing behavior

1. In the Modify panel, every shape gets a new **[+] Selection** rollout with three buttons: `• Vertex`, `— Segment`, `~ Spline` (mirrors 3ds Max sub-object icons). Toggling one enters that sub-object level for the current shape.
2. First time the user enters a sub-object level on a *parametric* shape (e.g. Rectangle), a small caddy asks:
   `“Converting parametric shape to Editable Spline. Continue?”` — same UX as Max. On confirm the shape type becomes `editable_spline` and the parametric rollout is replaced by the Editable Spline rollouts.
3. In each sub-object level:
   - **Vertex**: knots render as small squares (green = Corner, yellow = Smooth, blue = Bezier, cyan = Bezier Corner). Click to select, Ctrl-click to toggle, drag-box to marquee. Selected knots can be moved with the transform gizmo; Bezier handles show as green dots with tangent lines and are draggable.
   - **Segment**: hover highlights the segment; selected segments render red. Delete key removes them (opens the spline).
   - **Spline**: click any segment to select the whole connected spline; useful for Detach / Reverse / Close.
4. A new **[+] Geometry** rollout exposes the core Editable Spline ops that operate on the current selection:
   - Vertex level: `Break`, `Weld` (threshold spinner), `Fuse`, `Refine` (add knot on segment at click), `Fillet` (spinner), `Chamfer` (spinner), `Make First`, `Delete`, and a `Vertex Type` group with 4 radios (Corner / Smooth / Bezier / Bezier Corner) that rewrites the type of every selected knot.
   - Segment level: `Divide` (count spinner), `Detach`, `Delete`, `Reverse`.
   - Spline level: `Close / Open`, `Reverse`, `Outline` (offset spinner), `Boolean Union/Subtract/Intersect` (2D booleans on selected splines), `Mirror`, `Attach` (pick another shape).
5. A **[+] Soft Selection** rollout with Use / Falloff / Pinch / Bubble spinners, applied when moving knots (weighted displacement, same math as our mesh Soft Selection).
6. The **[+] Selection** rollout also shows the status line the reference screenshot describes: `Vertices: N`, `Closed: Yes/No`, `Edit vertices in sub-object mode. Vertex type (Corner / Smooth / Bezier / Bezier Corner) is set per-knot.`
7. All parametric shapes still work as before *until* the user enters a sub-object level or clicks a new `Convert To Editable Spline` button in the Modify panel footer.

## Technical implementation

### 1. New data model — `EditableSpline`
New file `src/components/3ds/editable/EditableSpline.ts`. Structure mirrors `EditableMesh`:

```ts
type KnotType = 'corner' | 'smooth' | 'bezier' | 'bezierCorner';
interface Knot { id: number; pos: THREE.Vector3; inHandle: THREE.Vector3; outHandle: THREE.Vector3; type: KnotType; }
interface Segment { id: number; a: number; b: number; }          // knot ids
interface Spline  { id: number; knots: number[]; closed: boolean; }
class EditableSpline {
  splines: Map<number, Spline>; knots: Map<number, Knot>; segments: Map<number, Segment>;
  // ops: break, weld, fuse, refine, fillet, chamfer, delete, divide, detach, reverse,
  //      close, open, outline, boolean, mirror, attach, setVertexType
}
```
`toCurves()` returns a `THREE.CurvePath` per spline (line or CubicBezier segments depending on knot types) for rendering and for `toShape()` / `toExtrudeGeometry()`. `fromParametricShape(kind, params)` builds an EditableSpline from any existing parametric shape so conversion is lossless.

### 2. Selection model
Extend the existing sub-object selection pattern:
- New level type `type SplineSubLevel = 'sknot' | 'ssegment' | 'sspline'`.
- `SplineSelectionContext` (new file `editable/splineSelection.ts`) mirrors the mesh Selection API: `emptySelection`, `grow`, `shrink`, `toKnotIds`.

### 3. Viewport interaction
New component `src/components/3ds/editable/SplineSubObjectOverlay.tsx` (parallel to the existing `SubObjectOverlay.tsx`):
- Renders knots as `THREE.Points` with per-knot color based on type; bezier handles as thin `Line` primitives.
- Hover / pick uses raycasting against knot points and against a `TubeGeometry` proxy for segments (fat-line for easy picking).
- Emits selection changes to `SplineSelectionContext`.
- When the active transform tool moves knots, `EditableSpline.setKnotPosition` is called and the parent object rebuilds its geometry through `toGeometry()` on the spline.

Hook it into `Scene3D` beside the mesh overlay, activated only when `selectedObject.type === 'editable_spline'` and a sub-level is active.

### 4. Object type + registration
- Add `'editable_spline'` to the object-type union in `Studio3D.tsx` and to `Object3D.tsx`'s renderer switch (falls back to the same TubeGeometry / mesh render as current shapes but sources geometry from `EditableSpline.toGeometry()`).
- Store the `EditableSpline` instance on the object as `object.editableSpline` (same pattern as `object.editableMesh`).

### 5. Modify panel UI
New file `src/components/3ds/r3/EditableSplinePanel.tsx` built with the existing `MaxRollout / MaxSpinner / MaxCheck / MaxSelect` primitives. Rollouts:
1. `Rendering` (reuse the current one)
2. `Interpolation` (reuse)
3. `Selection` — 3 sub-object buttons + status line + Named Selection Sets input
4. `Soft Selection`
5. `Geometry` — dynamic group of buttons whose enabled state depends on the active sub-level
6. `Vertex Type` — 4 radios, only visible in Vertex sub-level

`SidePanel.tsx` swaps `ShapeParametersPanel` for `EditableSplinePanel` when `object.type === 'editable_spline'`, and appends a `Convert to Editable Spline` button at the bottom of `ShapeParametersPanel` for parametric shapes.

### 6. File list

New:
- `src/components/3ds/editable/EditableSpline.ts`
- `src/components/3ds/editable/splineSelection.ts`
- `src/components/3ds/editable/splineOps.ts` (break / weld / fillet / chamfer / outline / boolean 2D / etc.)
- `src/components/3ds/editable/SplineSubObjectOverlay.tsx`
- `src/components/3ds/r3/EditableSplinePanel.tsx`

Edited:
- `src/components/3ds/Studio3D.tsx` — register type, sub-level state, conversion action
- `src/components/3ds/Object3D.tsx` — render `editable_spline` via `EditableSpline.toGeometry()`
- `src/components/3ds/Scene3D.tsx` — mount `SplineSubObjectOverlay`
- `src/components/3ds/SidePanel.tsx` — swap panel + Convert button
- `src/components/3ds/utils/extendedGeometry.ts` — expose `paramsToEditableSpline(kind, params)` used by the conversion action

### 7. Scope for this pass

This plan is large. To ship value quickly the first PR implements steps **1, 2, 3 (knot + segment picking, knot move), 4, 5 (Selection / Vertex Type / Geometry with Break, Weld, Refine, Delete, Fillet, Close/Open, Reverse), 6, 7** — the ops that cover ~90% of daily use. `Outline`, `Boolean`, `Chamfer`, `Attach`, `Soft Selection` and named selection sets are stubbed with disabled buttons and shipped in a follow-up.

Confirm and I'll build it.
