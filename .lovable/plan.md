## AEC Extended — Objetos de Arquitetura Paramétricos

Adicionar a categoria **AEC Extended** ao painel Create/Geometry com objetos paramétricos: Wall, Door, Window, Stairs, Railing e Foliage. Portas e janelas cortam a parede automaticamente e de forma **não-destrutiva**.

Dado o tamanho, entrego em **fases**. Cada fase é utilizável ao final.

---

### Fase 1 — Fundação: Wall (parede paramétrica)

- Adicionar categoria `aec` no `SidePanel` (Create → Geometry) com os 6 botões (Wall / Doors / Windows / Stairs / Railing / Foliage).
- Novo tipo `wall` com dados: `path: Vec3[]`, `width`, `height`, `justification: 'left'|'center'|'right'`, `closed`, `openings: WallOpening[]` (vazio nesta fase).
- Fluxo de criação (via `CreationController`): clique-a-clique idêntico ao Line — clique adiciona vértice, ESC/botão-direito finaliza. Preview ao vivo com espessura + altura.
- Geometria: para cada segmento do path, gerar um "box extrudado" ao longo do segmento com `width` e `height` respeitando `justification`. Cantos com miter join (interseção dos planos laterais adjacentes) para evitar sobreposição.
- Parâmetros no painel Modify: `width`, `height`, `justification`, checkbox Closed.
- Vértices editáveis: usar o mesmo padrão dos handles bezier de trajetória — âncoras arrastáveis no viewport quando um modo "Vertex" da wall estiver ativo no painel Modify. Mover vértice recalcula a mesh.

### Fase 2 — Door e Window paramétricos (sem corte ainda)

- Tipos `door` e `window` com subtipos:
  - Door: `pivot`, `bifold`, `sliding`, `pocket`
  - Window: `casement`, `sliding`, `awning`, `fixed`, `pivot`
- Parâmetros: `width`, `height`, `thickness`, `frameDepth`, `openPercentage` (door); `frameThickness`, `glassThickness`, `openPercentage`, `sillHeight` (window).
- Criação em 3 cliques (largura → profundidade → altura), como no 3ds Max.
- Geometria gerada em TypeScript (batente + folha/vidro) com `openPercentage` animando a rotação/deslocamento da folha.

### Fase 3 — Snap arquitetônico + Wall Opening não-destrutivo

- Ao arrastar uma door/window com uma wall próxima, fazer raycast contra os segmentos da wall:
  - Se distância < threshold → mostrar preview verde e "prender" à parede.
  - Ao soltar, criar vínculo `parentWallId` na door/window e um registro `WallOpening { doorId, tAlong, width, height, elevation }` no array `openings` da wall.
- Wall rebuild ignora regiões cobertas por openings ativos: gera a mesh com dois "tocos" acima/abaixo e nas laterais da abertura, mais o lintel e o parapeito. Corte é puramente paramétrico (rebuild da mesh a cada mudança), sem CSG.
- Se a door/window for deletada ou desanexada, a opening é removida e a parede volta ao normal.
- Door/Window vinculada trava a rotação para a normal do segmento e o movimento fica restrito ao eixo do segmento (translação `tAlong`) + altura.

### Fase 4 — Stairs, Railing, Foliage (versão simples)

- **Stairs** (straight): `width`, `totalHeight`, `steps`, `riser` e `tread` derivados; gera degraus como boxes.
- **Railing**: posts + top rail + bottom rail ao longo de um path (parâmetros: `postSpacing`, `postHeight`, `railCount`).
- **Foliage**: 3-4 presets simples (árvore genérica, arbusto, palmeira, pinheiro) — mesh procedural simplificada (tronco cilíndrico + copa esférica/cônica).

---

### Detalhes técnicos

**Onde entra no código**
- `src/components/3ds/utils/aecGeometry.ts` (novo): builders `buildWall`, `buildDoor`, `buildWindow`, `buildStairs`, `buildRailing`, `buildFoliage`.
- `src/components/3ds/Object3D.tsx`: reconhecer novos tipos e chamar builders (análogo ao ramo `shapes`).
- `src/components/3ds/SidePanel.tsx`: categoria `aec` com os botões + painéis de parâmetros em Modify.
- `src/components/3ds/r3/creation/CreationController.tsx`: fluxos de criação (Wall = multi-clique tipo Line; Door/Window = 3 cliques com preview).
- `src/components/3ds/Studio3D.tsx`: expor `openings`/`parentWall` no estado dos objetos e um efeito que reconstrói a wall quando a lista de openings, uma door/window vinculada, ou parâmetros da wall mudam.

**Estrutura de dados (resumida)**
```text
Wall.geometry = {
  path: [x,y,z][],
  width, height,
  justification: 'left'|'center'|'right',
  closed: boolean,
  openings: [{ id, ownerId, segIndex, tAlong, width, height, elevation }]
}
Door.geometry = { subtype, width, height, thickness, frameDepth, openPct, parentWallId? }
Window.geometry = { subtype, width, height, frameThickness, glassThickness, openPct, sillHeight, parentWallId? }
```

**Rebuild não-destrutivo (Fase 3)**
Para cada segmento da wall, gerar tiras horizontais em Y=[0, elevation], Y=[elevation, elevation+height], Y=[elevation+height, wall.height] nas regiões cobertas pela opening; fora da opening a tira ocupa Y=[0, wall.height]. Isso mantém o corte reativo e removível.

**Snap arquitetônico**
Enquanto uma door/window está selecionada e sendo movida, projetar seu centro sobre o segmento de wall mais próximo dentro de `snapRadius` (config); se houver, aplicar transform corrigido e destacar a wall.

---

### Fora do escopo (para depois)

- BIM real, IFC, DXF import/export.
- Escadas em L / U / espiral (só straight na Fase 4).
- Múltiplas paredes cortando-se entre si com T-junction avançado (miter simples só).
- Portas/janelas em paredes curvas (só segmentos retos na Fase 3).

---

Confirma este plano? Posso começar pela **Fase 1 (Wall + criação + edição de vértices)** já em seguida. As Fases 2 e 3 são as mais trabalhosas — se quiser reduzir o escopo inicial, sugiro entregar Fase 1 e Fase 3 (corte não-destrutivo) juntas com door/window básica (só `pivot`/`casement`) e adicionar os outros subtipos e Stairs/Railing/Foliage numa iteração seguinte.