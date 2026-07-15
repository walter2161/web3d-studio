# Edit Mesh / Edit Poly funcionais — Plano em fases

Objetivo: sub-objeto real (Vertex/Edge/Border/Face/Polygon/Element), com seleção no viewport, gizmos, e todas as operações do painel Modify agindo sobre a malha do objeto — mantendo o stack de modificadores não-destrutivo (Edit Mesh/Poly grava operações que reconstroem o `BufferGeometry` acima do objeto base).

Entrego uma fase por vez. Você aprova/testa, seguimos.

---

## Arquitetura comum (base para todas as fases)

Nova camada em `src/components/3ds/editable/`:

```text
editable/
  EditableMesh.ts       // estrutura half-edge-ish: vertices[], edges[], faces[] (tris ou n-gons)
  fromGeometry.ts       // BufferGeometry -> EditableMesh
  toGeometry.ts         // EditableMesh -> BufferGeometry (com groups p/ material IDs + smoothing)
  ops/                  // uma função pura por operação (extrude, bevel, weld, chamfer, ...)
  selection.ts          // Set<vId|eId|fId> + shrink/grow/ring/loop
```

- `Edit Poly` = n-gons preservados.
- `Edit Mesh` = mesma estrutura, mas `toGeometry` força triangulação e Vertex/Face/Polygon/Element (sem Edge/Border como sub-objetos primários — Edge só em versões tardias).
- O modifier guarda: `{ selectionLevel, selection: id[], ops: OpRecord[], smoothingGroups, materialIds }`. `ops` é replayed em cima do input geometry — assim continua não-destrutivo.

Integração com o pipeline atual: em `Object3D.tsx`, quando o topo do stack (ou o modifier atualmente selecionado) é Edit Mesh/Poly, o viewport passa a renderizar a geometry resultante e habilita picking de sub-objeto.

---

## Fase 1 — Infra + Seleção (ENTREGA AGORA nesta resposta? não: só planejo)

- `EditableMesh` + conversores.
- Overlay de sub-objeto no viewport: pontos p/ Vertex, linhas p/ Edge/Border, faces destacadas p/ Face/Polygon/Element.
- Picking por raycaster respeitando `selectionLevel`.
- Ignore Backfacing, By Vertex, By Angle, Shrink/Grow/Ring/Loop, Get Stack Selection.
- Soft Selection (falloff/pinch/bubble) calculada e visualizada por gradiente de cor.
- Botão "Show End Result" e "Pin Stack" ligados de verdade.

## Fase 2 — Edit Geometry básico (mais usado)

- Move/Rotate/Scale de sub-objeto usando os gizmos existentes.
- Delete, Detach (→ novo objeto ou elemento), Attach (picker de outro objeto na cena).
- Create (vertex/face), Collapse (weld por seleção), Break, Weld (threshold), Chamfer (vertex/edge).
- Flip Normals, Unify Normals.
- Hide Selected / Unhide All / Hide Unselected.

## Fase 3 — Edit Polygons / Faces

- Extrude (Group / Local Normal / By Polygon, height + interativo).
- Bevel (height + outline).
- Inset (Group / By Polygon).
- Outline.
- Bridge (2 seleções de face/edge/border).
- Hinge From Edge, Extrude Along Spline.
- Insert Vertex, Edit Triangulation, Retriangulate, Turn (Edit Mesh).

## Fase 4 — Cortes e subdivisão

- Slice Plane + Slice / Reset Plane / Split.
- QuickSlice, Cut.
- MSmooth (peso), Tessellate (edge/face-center), Divide.
- Make Planar (X/Y/Z), View Align, Grid Align, Relax.

## Fase 5 — Material IDs + Smoothing Groups + Named Selections

- Painel Material IDs: Set ID / Select ID / Clear + `geometry.groups` reais por ID.
- Smoothing Groups: matriz 1..32, Auto Smooth (threshold), Clear All, Select By SG. `computeVertexNormals` respeitando SG.
- Named Selection Sets: Copy/Paste entre modificadores.

## Fase 6 — Polimento

- Constraints (Edge/Face/Normal) aplicadas durante transform de sub-objeto.
- Preserve UVs.
- Preview Selection (SubObj / Multi).
- Undo/Redo por operação dentro do modifier.
- Persistência: `ops[]` salva/carrega no arquivo do projeto.

---

## Detalhe técnico (para referência)

- Sem libs externas: escrevo half-edge minimalista em TS. Já temos three.js.
- `toGeometry` produz um único `BufferGeometry` com `groups` = material IDs e `attributes.normal` calculado por smoothing group.
- Overlay de sub-objeto = `Points` + `LineSegments` + `Mesh` com `depthTest` reduzido, filhos do próprio objeto para seguir transformações.
- Gizmo reusa `TransformControls` atual, mas anexado a um `Object3D` proxy centrado na seleção; ao arrastar, aplico o delta a cada vId selecionado (com pesos de soft selection).
- Cada operação = função pura `(mesh, selection, params) => { mesh, selection }`, gravada em `ops[]` do modifier — reexecutada quando parâmetros abaixo no stack mudam.

---

## Próximo passo

Ao aprovar, começo pela **Fase 1** (infra + seleção de sub-objetos no viewport com Soft Selection e Shrink/Grow/Ring/Loop). É a base sem a qual nenhum botão das outras fases faz sentido.
