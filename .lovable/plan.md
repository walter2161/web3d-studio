## Sprint F — Interactive Creation (Click-Drag no estilo 3ds Max R3)

Hoje `createObject` spawna o objeto no `(0,0,0)` com dimensões default. Vou substituir por um fluxo modal de criação idêntico ao 3ds Max clássico: ferramenta ativa → cursor crosshair → clique → arrasta base → solta → arrasta altura → clique confirma → painel Modify abre com parâmetros vivos.

### 1. Máquina de estados de criação (novo `CreationController`)

Arquivo novo: `src/components/3ds/r3/creation/CreationController.tsx` + `useCreationTool.ts`.

Estados:
```text
idle → armed(tool) → dragging-base → awaiting-height → dragging-height → committed
              ↑                                                          │
              └──────────────── ESC cancela em qualquer etapa ───────────┘
```

Contexto global (`CreationProvider`) expõe:
- `armedTool: PrimitiveType | null`
- `arm(tool)`, `disarm()`
- estado atual + objeto "fantasma" em construção

O `SidePanel` (Create tab) e o `MainToolbar` chamam `arm(type)` em vez de `createObject(type)` direto. Botão fica "pressed" enquanto armado.

### 2. Pointer handling na Viewport

Em `Viewport.tsx`, quando `armedTool` existe:
- Cursor CSS: `crosshair`
- `OrbitControls.enabled = false`
- `onPointerDown/Move/Up` fazem raycast contra:
  - plano da grid ativa (Top → XZ, Front → XY, Left → YZ, Perspective → XZ por default)
  - se AutoGrid ligado, contra a face sob o cursor (normal define orientação do novo pivot)
- Aplica snap (grid/vertex/edge/midpoint) usando `snapCfg` já existente.

Dois estágios de arrasto por tipo (tabela abaixo). Durante cada estágio um objeto temporário é adicionado ao state com `geometry` sendo mutado a cada frame (throttled via `requestAnimationFrame`). ESC remove; clique/soltar avança.

### 3. Fluxos por primitiva

| Tipo         | Estágio 1 (drag base)          | Estágio 2 (mouse move) | Pivot          |
|--------------|--------------------------------|------------------------|----------------|
| Box          | width + length (2 cantos)      | height                 | centro da base |
| Plane        | width + length                 | —                      | centro         |
| Cylinder     | radius (raio a partir do click)| height                 | centro da base |
| Cone         | radius base                    | height → radius top    | centro da base |
| Sphere/GeoSphere | radius                     | —                      | centro         |
| Torus        | radius principal               | radius secundário      | centro         |
| Teapot       | radius                         | —                      | centro da base |
| Pyramid      | width + depth                  | height                 | centro da base |
| Tube         | outer radius                   | inner radius → height  | centro da base |
| Hedra / TorusKnot / ChamferBox / ... | radius/size 1 canto  | segundo drag onde faz sentido | centro |
| Shapes 2D (Line, Rectangle, Circle, ...) | fluxo próprio (line = múltiplos cliques até Enter/right-click) | — | centro |

Cada primitiva ganha um handler pequeno em `creation/tools/<tool>.ts` que recebe `{ startPoint, currentPoint, stage }` e devolve `{ position, geometry }`. Isso mantém o controller genérico.

### 4. Pivot policy

Novo helper `pivotForType(type)` — base vs centro (tabela da mensagem do usuário). No commit: transladamos vértices para que a origem local do objeto fique no pivô correto, e ajustamos `position` para o ponto do mundo escolhido.

### 5. Keyboard Entry (criação precisa)

Na aba Create do `SidePanel`, quando uma ferramenta está armada, mostra rollout **"Keyboard Entry"** (X/Y/Z + parâmetros do tipo) + botão **Create**. Chama o mesmo commit do controller sem passar pelo drag.

### 6. Snap "S" e AutoGrid

- `S` já alterna `snapEnabled` — o controller já respeita.
- Toolbar ganha toggle **AutoGrid** (já existente em Snaps? senão adiciono). Quando ligado, o raycast prioriza a face sob o cursor e alinha o novo objeto à normal.

### 7. Pós-criação

Após commit:
- Objeto continua selecionado.
- `SidePanel` troca automaticamente para tab **Modify** (`setSidePanelTab('modify')`).
- Undo empurra estado anterior (já usa `saveState`).
- ESC durante drag → não empurra undo, objeto some.

### 8. SHIFT+Move = Clone

Fora do fluxo de criação, mas pediram: no `TransformControls` `onMouseDown`, se `shiftKey`, abrir o `CloneDialog` (Copy / Instance / Reference) já no fim do drag e criar cópia com o delta aplicado. Novo `src/components/3ds/r3/CloneDialog.tsx`.

### 9. Arquivos afetados

**Novos:**
- `src/components/3ds/r3/creation/CreationContext.tsx`
- `src/components/3ds/r3/creation/CreationController.tsx` (raycast + pointer FSM)
- `src/components/3ds/r3/creation/tools/{box,cylinder,cone,sphere,torus,plane,pyramid,tube,teapot,hedra,chamferBox,chamferCyl,oilTank,spindle,gengon,torusKnot,ringWave,prism,line,rectangle,circle,ellipse,arc,donut,ngon,star,helix}.ts` (agrupados em um único `toolRegistry.ts` para não explodir arquivos)
- `src/components/3ds/r3/creation/pivot.ts`
- `src/components/3ds/r3/CloneDialog.tsx`

**Editados:**
- `Studio3D.tsx` — envelopa em `<CreationProvider>`, substitui chamadas de `createObject` no Create panel por `arm()`, troca tab para Modify pós-commit.
- `SidePanel.tsx` — botões de primitivas viram "armar ferramenta"; adiciona rollout Keyboard Entry.
- `Viewport.tsx` — monta o `<CreationController>` dentro do Canvas; desativa OrbitControls quando armado; cursor crosshair.
- `Scene3D.tsx` — nada (o objeto fantasma é apenas mais um item de `objects` com flag `__creating`).
- `Object3D.tsx` — respeita flag `__creating` (sem raycast de seleção enquanto em construção).
- `KeyboardShortcuts.tsx` — ESC cancela criação; Enter confirma Keyboard Entry.
- `ToolbarStrip.tsx` — toggle AutoGrid.
- `extendedGeometry.ts` — expõe função `applyDrag(type, stage, dims)` reutilizada pelo controller.

### 10. Fora do escopo desta sprint

Editable Poly (Extrude/Inset/Bevel/Chamfer interativos), Reset XForm real, Window vs Crossing selection direction-aware, Align (ALT+A). Ficam para Sprint G.

---

Quer que eu implemente tudo isso agora, ou prefere que eu faça primeiro só os primitivos Standard (Box/Sphere/Cylinder/Cone/Torus/Plane) + ESC + Modify auto-switch, e deixe Extended/Shapes/Clone/AutoGrid/Keyboard Entry para uma etapa seguinte?