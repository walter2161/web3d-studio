# Roadmap: Paridade total com 3ds Max R3

Objetivo: transformar o 3dsLed em uma réplica funcional completa do 3ds Max R3. O plano abaixo prioriza por dependência técnica e valor imediato para o usuário. Cada fase entrega valor de forma isolada.

Legenda de esforço: 🟢 baixo · 🟡 médio · 🔴 alto

---

## Fase 1 — Primordiais (fundação obrigatória)

O que faz o app "parecer funcionar" como o R3 no uso diário. Sem isto, o resto não fecha.

### 1.1 Estado global de cena e serialização
- 🟡 Store central (`SceneContext`) com histórico Undo/Redo consolidando: objetos, seleção, câmera, timeline, environment, snaps, unidades.
- 🟡 **Hold / Fetch** (snapshot temporário em memória) e **New Scene / Reset** com confirmação.
- 🟢 **Exit** com prompt "Save changes?".

### 1.2 Sistema de coordenadas e status bar viva
- 🟡 Coordinate display X/Y/Z real: segue cursor no viewport ativo e mostra posição do objeto selecionado.
- 🟢 **Grid = N** dinâmico (lê Grid and Snap Settings).
- 🟡 **Units Setup** (Generic / Metric / US Standard) — converte display em toda a UI.

### 1.3 Grid and Snap Settings
- 🟡 Diálogo R3 completo (Snaps · Options · Home Grid · User Grids).
- 🔴 Snap real ao mover/rotacionar/escalar (Grid Points, Vertex, Edge, Face, Midpoint) — hook no `TransformControls`.
- 🟢 Snap toolbar liga/desliga corretamente cada snap.

### 1.4 Region Select + Select By...
- 🟡 Marquee rectangle/circular/fence no viewport (Crossing/Window).
- 🟡 **Select By Name…**, **Select Invert**, **Select All / None** funcionando via menu Edit.
- 🟢 Named Selection Sets (dropdown na main toolbar).

### 1.5 Viewport controls faltantes
- 🟢 **Alt+W** (maximize viewport).
- 🟡 **Viewport Configuration…** (Rendering Method, Layout, Safe Frames, Adaptive Degradation).
- 🟢 **Show Grid**, **Show Statistics** toggles reais.
- 🟡 **Semi-Render mode** — passe simplificado com sombras leves (não só transparência).

### 1.6 Object Properties
- 🟡 Diálogo R3 (General · Rendering Control · Motion Blur · Advanced Lighting) — casting/receiving shadows, visibility, renderable, cor do wireframe.

---

## Fase 2 — Secundários (completar o fluxo criativo)

Cobrem as ferramentas usadas em 80 % dos projetos reais no R3.

### 2.1 Create panel completo
- 🟡 **Extended Primitives**: Hedra, ChamferBox, ChamferCyl, OilTank, Spindle, Gengon, Torus Knot, RingWave, Prism.
- 🟡 **Shapes**: Line, Rectangle, Circle, Ellipse, Arc, Donut, NGon, Star, Text, Helix, Section (splines editáveis).
- 🔴 **Compound Objects**: Boolean (Union/Subtract/Intersect), Loft, Scatter, Connect, ShapeMerge, Terrain.
- 🟡 **AEC Objects**: Wall, Door, Window, Stair, Railing, Foliage.
- 🟢 **Helpers**: Dummy, Point, Tape, Protractor, Compass.
- 🟡 **Particle Systems**: Spray, Snow, Super Spray, Blizzard (partículas simuladas em CPU).
- 🟡 **Lights**: Omni, Target Spot, Free Spot, Target Direct, Free Direct, Skylight (todas com atenuação R3).
- 🟡 **Cameras**: Target Camera, Free Camera com FOV, DOF, Clipping Planes.

### 2.2 Group menu funcional
- 🟢 **Group / Ungroup / Open / Close / Attach / Detach / Explode** com nome de grupo e seleção coletiva.
- 🟢 Grupos aparecem colapsáveis na Hierarchy.

### 2.3 Modifier stack completo
- 🔴 Cada modificador do menu como nó do stack não-destrutivo, com parâmetros:
  - Parametric Deformers: **Bend, Twist, Taper, Skew, Stretch, Squeeze, Push, Relax, Noise, Ripple, Wave, Spherify, Displace, Slice, Optimize, MultiRes**.
  - Free Form: **FFD 2×2×2, FFD 3×3×3, FFD 4×4×4, FFD (box), FFD (cyl)**.
  - Selection: **Mesh Select, Poly Select, Volume Select, Vertex Weld**.
  - **Edit Mesh, Edit Poly, TurboSmooth, MeshSmooth, Symmetry, Shell, Cap Holes**.
- 🟡 Sub-object editing (Vertex/Edge/Face/Poly/Element) real no viewport com gizmo.
- 🟢 Copy/Paste/Instance de modificadores; enable/disable por modifier.

### 2.4 Hierarchy · Motion · Display · Utilities tabs
- 🟡 **Hierarchy**: Pivot (Adjust Pivot / Affect Pivot Only / Reset Pivot), Link Info (Locks/Inherit), IK.
- 🟡 **Motion**: Parameters (transform controllers), Trajectories (3D path preview).
- 🟢 **Display**: Hide/Freeze by Category, by Selection, by Hit; Display Properties.
- 🟡 **Utilities**: Asset Browser, Measure, Reset XForm, Collapse.

### 2.5 Main toolbar botões
- 🟡 **Mirror**, **Array**, **Align**, **Spacing Tool**, **Normal Align**.
- 🟢 **Layer Manager** (criar/renomear layers, mover objetos).
- 🟢 **Named Selection Sets** dropdown.
- 🟡 **Snap Toggle 2D/2.5D/3D**, **Angle Snap**, **Percent Snap**, **Spinner Snap**.

### 2.6 Material Editor R3
- 🔴 24 sample slots com esferas/cubos/cilindros de preview.
- 🟡 Material tree: Standard, Blend, Composite, Double Sided, Multi/Sub-Object, Raytrace, Matte/Shadow, Top/Bottom, Shellac.
- 🟡 Maps: Bitmap, Checker, Gradient, Noise, Marble, Mix, Falloff, Reflect/Refract, Flat Mirror, Composite, Mask, RGB Tint, Output, Vertex Color.
- 🟢 Get Material / Put to Scene / Assign to Selection / Show Map in Viewport.
- 🟡 UVW Map modifier + UVW Unwrap básico.

### 2.7 Animation core
- 🟡 **Set Key / Auto Key** funcionais em todas as propriedades numéricas.
- 🟡 **Time Configuration** (frame rate, start/end, playback speed, direction).
- 🟡 **Track View – Dope Sheet** (lista de tracks, drag de keys).
- 🔴 **Track View – Curve Editor** (Bezier handles, in/out tangent types: Auto, Custom, Fast, Slow, Step, Linear, Smooth).
- 🟢 **Key Filters** (Position, Rotation, Scale, IK Params, Object, Material, Modifier).

### 2.8 Rendering pipeline real
- 🟡 Time Output (Single/Active/Range/Frames) executando sequência.
- 🟡 Output Size aplicando ao render offline (não só ao viewport).
- 🟡 Ligar Anti-Aliasing filter (Area, Blackman, Catmull-Rom, Mitchell-Netravali) via samples do WebGLRenderer.
- 🟡 **Save File** → PNG/JPEG/TIFF sequence com padding numérico.
- 🟢 Draft vs Production renderer switch.

---

## Fase 3 — Avançados (fidelidade máxima ao R3)

O que separa uma "réplica" de uma "reconstrução completa".

### 3.1 Track View · Schematic View · Curve Editor completos
- 🔴 Modo Dope Sheet e Curve Editor unificados, filtros de tracks, visibility, ranges, out-of-range types (Cycle, Loop, Ping Pong, Linear, Relative Repeat).
- 🔴 **Schematic View**: grafo de nós de todos os objetos + controllers + modifiers + materiais, com links visuais.

### 3.2 Controllers e Constraints
- 🔴 Controllers R3: Bezier, TCB, Linear, Noise, Smooth, Waveform, Expression, Script, List, XRef, Attachment, Motion Capture.
- 🔴 Constraints: Position, Orientation, Look-At, Path, Surface, Link, Attachment.

### 3.3 Character Studio (Biped/Physique) — subset
- 🔴 Bones system (Bone Tools: Create Bones, IK Solvers HI/HD, Bone properties).
- 🔴 Skin modifier básico (envelopes + vertex weights).
- 🔴 IK Solvers (HI, HD, Spline IK).

### 3.4 Advanced Lighting
- 🔴 **Light Tracer** (aproximação via ambient occlusion + GI screen-space).
- 🔴 **Radiosity** solution (pré-cálculo aproximado por face).
- 🟡 **Exposure Control** real (Automatic / Linear / Logarithmic) aplicando curva ao render.

### 3.5 Environment & Effects avançados
- 🟡 **Volume Fog** (shader ray-march simples).
- 🟡 **Volume Light** (god rays por post-process).
- 🟡 **Fire Effect** (billboard procedural + noise).
- 🟢 **Environment Map** (spherical/cubic) no `scene.background` e reflexos.

### 3.6 Video Post
- 🔴 Diálogo Video Post com queue de eventos, layers, transitions, filters, alpha compositor, image inputs — pipeline de post-process encadeado.

### 3.7 Customize · Preferences · UI Scheme
- 🟡 **Preferences** completa (General, Files, Viewports, Gamma, Rendering, Animation, Inverse Kinematics, Gizmos, MAXScript, Radiosity).
- 🟡 **Customize User Interface** (Keyboard, Toolbars, Quads, Menus, Colors) com persistência.
- 🟢 **Load/Save Custom UI Scheme** (`.cui` equivalente em JSON).

### 3.8 MAXScript engine
- 🔴 Listener (REPL) + interpretador subset (variáveis, `for/while`, chamadas de funções expostas do app: `box()`, `move`, `rotate`, `select`, `render()`).
- 🟡 New/Open/Run Script com editor de código monospace.

### 3.9 Import/Export nativos R3
- 🟡 **.3DS** import/export (formato binário legado).
- 🟡 **.MAX** placeholder (JSON serializando toda cena + modificadores + materiais + timeline).
- 🟢 **.DXF**, **.OBJ**, **.STL**, **.DWG** import via loaders three.js.

### 3.10 Renderers plugáveis
- 🔴 Interface de renderer (Assign Renderer…): Default Scanline (atual), VUE File, e um placeholder para custom.
- 🔴 Raytracer real via `three-mesh-bvh` para reflexos/refrações verdadeiras.

### 3.11 Help completo
- 🟢 User Reference (páginas HTML embutidas por tópico).
- 🟢 MAXScript Reference (referência da API implementada).
- 🟢 Tutorials (passo-a-passo interativo).
- 🟢 About 3ds Max… (splash com versão/créditos).

---

## Detalhes técnicos

- **Store global**: migrar `useState` fragmentado em `Studio3D.tsx` para um único Zustand store dividido em slices (`scene`, `selection`, `timeline`, `env`, `snaps`, `prefs`, `history`) — habilita Undo/Redo confiável e Hold/Fetch triviais.
- **Persistência**: manter localStorage para autosave + adicionar export/import `.max` (JSON) que serialize todo o store.
- **Modifier stack**: refatorar `Object3DData` para conter `{ baseGeometry, modifiers: Modifier[] }` e recomputar geometria por composição (memoizada por hash dos parâmetros).
- **Sub-object editing**: usar `BufferGeometry.groups` + custom raycaster por vertex/edge/face; gizmo com `TransformControls` reaproveitado.
- **Track View / Curve Editor**: componente canvas 2D dedicado (não SVG) para performance com muitas keys.
- **MAXScript**: parser simples via `chevrotain` ou implementação manual recursive-descent; exponha uma API JS espelhando comandos R3.
- **Renderers plugáveis**: interface `IRenderer { render(scene, camera, opts): Promise<HTMLCanvas> }`; scanline atual e futuros implementam.
- **Compound Objects (Boolean)**: usar `three-bvh-csg` para operações booleanas performáticas.
- **Snap system**: hook `useSnap()` que intercepta `TransformControls` events e ajusta target antes de aplicar.

## Ordem de execução recomendada

Se você aprovar, vou executar nesta sequência de sprints (cada bloco é um deploy separado):

1. **Sprint A — Fundação**: 1.1 · 1.2 · 1.6 · 2.2 (Group)
2. **Sprint B — Snap & Select**: 1.3 · 1.4 · 1.5 · 2.5
3. **Sprint C — Modeling**: 2.1 (Shapes + Extended) · 2.3 (modifier stack full)
4. **Sprint D — Command Panel**: 2.4 · 2.6 (Material Editor R3)
5. **Sprint E — Animation**: 2.7 · 3.1 (Track View + Curve Editor)
6. **Sprint F — Rendering**: 2.8 · 3.4 · 3.5
7. **Sprint G — Compound & AEC**: 2.1 restante · 3.9 · 3.10
8. **Sprint H — Character**: 3.3 · 3.2 (Controllers)
9. **Sprint I — Scripting & Post**: 3.6 · 3.7 · 3.8
10. **Sprint J — Polimento**: 3.11 · revisão pixel-a-pixel do chrome vs. screenshot original

Estimativa realista: cada sprint = 1-3 iterações de chat. Total ~30-40 iterações para paridade R3 completa.

## Confirmação

Me diga:
1. Aprovar este plano geral?
2. Começar pelo **Sprint A** (fundação) ou pular para outro sprint específico?
3. Alguma prioridade que você quer subir de fase (ex.: Material Editor antes do Snap)?
