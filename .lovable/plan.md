## Objetivo

Adicionar **sub-objetos Gizmo e Center** aos modificadores (estilo 3ds Max), permitindo que o usuário selecione, mova, rotacione e escale o gizmo na viewport para alterar posição/eixo/proporção da deformação sem tocar na malha original.

## Fase 1 — Infraestrutura (base para todos)

1. **Adicionar `gizmoMatrix` e `centerMatrix` em cada modificador** (`modifier.params.gizmo = { pos, rot, scale }`, `modifier.params.center = { pos }`). Default = identidade.
2. **Expor sub-objetos na hierarquia do Modifier Stack** (`SidePanel.tsx`): ao expandir Bend/Twist/Taper/Noise/etc, listar filhos "Gizmo" e "Center" (ou "Control Points" para FFD).
3. **Estado global do sub-object ativo do modificador** (`modifierSubStore`) — qual modificador+parte está selecionada.
4. **Componente `ModifierGizmoOverlay`** que renderiza na viewport quando um Gizmo está ativo:
   - Caixa wireframe amarela do tamanho do bbox da malha.
   - `TransformControls` do three.js atrelado ao `gizmoMatrix`, respeitando a ferramenta ativa (Move/Rotate/Scale).
   - Center = esfera pequena com só translação.
5. **Refatorar cada `applyXxx(geometry, params)`** para transformar cada vértice por `inverse(gizmoMatrix)` antes de deformar e por `gizmoMatrix` depois. O Center desloca a origem interna da deformação.

## Fase 2 — Modificadores existentes (Bend, Twist, Taper, Noise)

Aplicar o pipeline Gizmo/Center nos 4 já implementados. Isso substitui os parâmetros ad-hoc de eixo/direção pela rotação do gizmo (o usuário ainda pode digitar via propriedades, mas manipular na viewport é o principal).

## Fase 3 — Modificadores adicionais desta lista

Como muitos ainda não existem no projeto, esta fase implementa apenas o **gizmo + esqueleto do modificador** para os que já estão no menu de modificadores. Para modificadores ainda não implementados, o gizmo entra junto com o modificador na medida em que ele for adicionado — não vou criar 20 modificadores novos neste passo.

Cobertura direta agora (têm código existente):
- Bend, Twist, Taper, Noise, Shell (Shell não tem gizmo, fica de fora).

Ficam para futuras solicitações (a arquitetura estará pronta):
- Skew, Stretch, Melt, Wave, Ripple, Bomb, Displace, UVW Map, Slice, Symmetry, Volume Select, PathDeform, Projection, Spherify, FFD, Lattice.

## Detalhes técnicos

- `gizmoMatrix` armazenado como `{ position:[x,y,z], rotation:[x,y,z], scale:[x,y,z] }` para serializar limpo no arquivo do projeto e no undo/redo.
- Deformação passa a operar em "gizmo space":
  ```
  local = inverse(G) * vertexLocal
  local' = deform(local - center) + center
  vertexLocal' = G * local'
  ```
- `TransformControls` já usado em outros pontos do projeto — reaproveitar. Bloqueia `OrbitControls` durante o drag (mesmo padrão já usado nas bezier).
- Undo/redo integrado ao sistema atual (mesma pipeline de `updateParam`).
- Ícones da hierarquia: gizmo laranja quadrado, center bolinha azul, seguindo estética 3ds Max.

## Arquivos afetados

- `src/components/3ds/Object3D.tsx` — pipeline gizmo em applyBend/Twist/Taper/Noise.
- `src/components/3ds/SidePanel.tsx` — hierarquia expandida com filhos Gizmo/Center.
- `src/components/3ds/ModifierControls.tsx` — mostrar botão "Show End Result" e estado do sub-objeto.
- **Novo:** `src/components/3ds/r3/ModifierGizmoOverlay.tsx`.
- **Novo:** `src/components/3ds/r3/modifierSubStore.ts`.

## Fora do escopo desta rodada

- Implementar do zero os modificadores da lista que ainda não existem (Wave, FFD, UVW Map, etc.). Cada um, quando for pedido, herda a arquitetura de gizmo já pronta.
- Escala não-uniforme em Center (Max também não permite).

Confirma que posso ir por esse caminho, começando pelos 4 modificadores existentes (Bend, Twist, Taper, Noise) com Gizmo + Center totalmente manipuláveis na viewport?