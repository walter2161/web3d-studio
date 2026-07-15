O escopo total de Helpers + Space Warps + Systems é enorme — Biped sozinho é meses de trabalho. Proponho entregar em 3 fases, cada uma navegável e útil por si só. Confirme e eu implemento a Fase 1 nesta mesma iteração.

## Fase 1 — Helpers completos + esqueleto das outras duas abas

**Novas abas no SidePanel** (Create):
- `helpers`, `spaceWarps`, `systems` (ao lado das já existentes: standard/extended/shapes/aec/lights/cameras).

**Helpers 100% funcionais** (não renderizam no output final — só aparecem na viewport):
- **Point** — ícone `+` com opções Cross / Box / Axis Tripod / Center Marker, size, constant screen size
- **Dummy** — wireframe box paramétrica (comprimento/largura/altura), pivô central, sem geometria renderizável
- **Tape Measure** — 2 cliques (start/end); mostra `distance` no painel Modify, linha na viewport com endpoints
- **Grid** — grid local retangular (length/width/spacing) que pode ser "ativado" como plano de construção
- **Compass** — anel com marcações N/E/S/W (raio configurável); rotação Y aponta o "norte" da cena

Tudo isso renderiza com `<Line>`, `<Sprite>`, `<Html>` do drei — sem BufferGeometry pesada, e o exportador ignora esses tipos.

**Space Warps e Systems**: só a aba, botões desabilitados/tooltip "Em breve — Fase 2/3", para o usuário já ver o layout.

## Fase 2 — Space Warps mínimos

Sistema de binding + avaliação por frame:
- Warps: **Gravity, Wind, Ripple, Bomb, FFD 2×2×2, Deflector**
- Cada objeto ganha `boundWarps: string[]` (ids dos warps)
- Botão "Bind to Space Warp" na toolbar Space Warps
- Loop de avaliação por frame: warps geométricos (Ripple, FFD) deslocam vértices no `useFrame`; warps físicos (Gravity/Wind) só aplicam quando houver partículas — fica como stub visual até termos sistema de partículas
- Deflector: plano ou volume, sem física real ainda (só visual)

## Fase 3 — Systems

- **Bones**: cadeia clique-a-clique, cada osso é um `Object3D` filho do anterior, editável em sub-object mode
- **Sunlight/Daylight**: cria um Directional Light + Compass helper com controles de latitude/longitude/hora/data que reposicionam o sol
- **Ring Array**: assistente para replicar objeto selecionado em N cópias distribuídas em círculo (count/radius/angle)
- **Bones + IK Chain**: solver de 2-bone IK simples (mão → braço)
- **Biped**: fora de escopo — remover ou marcar como "requires Character Studio port"

## Detalhamento técnico da Fase 1

**Novo tipo `helper`** com subtype: `point | dummy | tape | grid | compass`.

```text
Object3DData.type: adicionar 'helper'
Object3DData.geometry.helperKind: 'point' | 'dummy' | ...
Object3DData.geometry.helperParams: { size, showCross, showBox, ... }
```

Renderização em `Object3D.tsx`:
- Novo caminho `if (type === 'helper')` que retorna React children (não mesh):
  - Point: `<group>` com 3 `<Line>` cruzadas + opção box wireframe
  - Dummy: `<lineSegments>` a partir de `EdgesGeometry(BoxGeometry)`
  - Tape: `<Line>` entre `p0` e `p1` + `<Html>` mostrando distância
  - Grid: `<gridHelper>` do three com tamanho customizável
  - Compass: `<Line>` circular + 4 marcações N/E/S/W

**Fluxo de criação (`CreationController.tsx`)**:
- `point`, `dummy`, `compass`, `grid`: single-click (drag opcional para size)
- `tape`: 2-click (start, end) — parecido com criar Wall
- helpers não recebem material nem cor de wire — cor fixa amarela/ciano estilo Max

**SidePanel Modify** ganha rollout específico por helperKind:
- Point: Size spinner, checkboxes Cross/Box/Axis Tripod/Center Marker/Constant Screen Size
- Dummy: Length/Width/Height spinners
- Tape: Distance (read-only, computed), Specify Length checkbox + spinner
- Grid: Length/Width/Spacing spinners, botão "Activate Grid"
- Compass: Radius spinner

**Exportador/Render**: skipa objetos com `type === 'helper'` (não vão para gltf, USD nem renderização final).

**Guardar linha "não renderiza" com clareza**: adicionar tag visual `[helper]` na hierarquia de cena e ícone diferenciado no browser.

## Ordem de execução na Fase 1

1. Adicionar `helper` em `Object3DData.type` + `CreatableTool`.
2. Criar `src/components/3ds/utils/helpers.ts` com defaults + tipos.
3. Renderizar helpers em `Object3D.tsx` (retorno alternativo, sem mesh).
4. Adicionar branches em `CreationController.tsx`.
5. Adicionar 3 novas categorias (`helpers`, `spaceWarps`, `systems`) na `SidePanel`.
6. Novo bloco Modify para helper kind selecionado.
7. Marcar Systems/Space Warps buttons como disabled + tooltip.

Isso mantém a Fase 1 sob controle e entregável agora. Fases 2 e 3 vão precisar de trabalho dedicado — cada Space Warp real e cada System (Bones, Daylight) merecem sua própria rodada porque envolvem loops de avaliação por frame, solvers e UI de binding.

Confirme e eu já começo a Fase 1.