# Print3D Toolkit — Plugin Plan

Novo plugin **Print3D** acessível pela aba **Create → Systems → Print3D** (e também via um novo painel lateral "Print Tools"). Foco inicial: **Elegoo Mars 2 Pro (129×80×160 mm)**. Não faz slicing nem gera suportes — só prepara o objeto para exportar ao Lychee/Chitubox.

O escopo é muito grande (21 ferramentas). Proponho dividir em **4 fases** e implementar a Fase 1 agora. As demais entram em turnos seguintes conforme você aprovar.

---

## Fase 1 — Fundação (implementar agora)

Estrutura do plugin + as ferramentas visuais/geométricas mais fáceis e de maior impacto imediato:

1. **Printer Profile system** — JSON de impressoras (`printers.ts`), começando com Mars 2 Pro e Saturn 4 Ultra. API `addPrinter()` para o futuro painel de settings.
2. **Build Plate** — objeto de cena novo (`print_bed`) criado pelo Create → Systems → Print3D. Renderiza:
   - plataforma sólida no chão (129×80 mm),
   - caixa transparente de volume (altura 160 mm),
   - grade quadriculada na base.
3. **Bounds Check** — objetos fora do volume ficam com outline vermelho (badge no viewport indica quantos).
4. **Center On Plate** — botão que centraliza o objeto selecionado em X/Y sobre o bed ativo.
5. **Drop to Bed** — raycast pra baixo até a base do bed, encosta o objeto (respeita bounding box mundial).
6. **Scale for Print** — diálogo com fator (ex.: 1:100) e conversão de unidades (m → mm), aplicado ao selecionado.
7. **Painel "Print Tools"** — nova aba lateral (`SidePanel`) com seções colapsáveis. Nesta fase entram: Printer, Build Plate, Bounds, Center, Drop, Scale, Export.
8. **Export STL/OBJ** — reaproveita o export existente; apenas expõe botão direto no painel.

Entrega da Fase 1 = plugin utilizável ponta a ponta: cria bed, checa limites, centraliza, encosta, escala e exporta.

## Fase 2 — Análise de malha
- Watertight Check
- Mesh Repair (non-manifold, open edges, dup verts, flipped normals, self-intersect) + Auto Repair
- Thin Geometry / Thickness Analyzer com mapa de cor (vertex colors)
- Overhang Analyzer (mapa de cor por ângulo da normal vs. Z)
- Hollow/Volume Analyzer (estimativa de resina em ml)

## Fase 3 — Modificação de malha
- Smart Thicken (inflate normals + smooth em regiões finas)
- Remesh (Voxel/Adaptive)
- Polygon Optimizer (quadric-error decimation via three-mesh-bvh + simplify)
- Unify Objects (merge sem boolean destrutivo)

## Fase 4 — Ferramentas de composição / impressão
- Create Base (circular/quadrada/orgânica, chamfer)
- Cut for Print (plano de corte + male/female connectors)
- Keying System (pinos/encaixes/ímãs)
- Print Orientation suggestion
- Virtual Diorama Tool (escalas 1:50/1:100/1:200)
- External Structure Tool (paredes ocas, pisos separáveis)
- Import 3MF/PLY/GLB, Export 3MF
- **Print Safe Mode** — dashboard consolidado com checklist final

---

## Estrutura técnica proposta

```text
src/components/3ds/print3d/
├── printers.ts               # perfis (Mars 2 Pro, Saturn 4 Ultra)
├── PrintBedObject.tsx        # renderer r3f do bed
├── PrintToolsPanel.tsx       # painel lateral (aba nova)
├── boundsCheck.ts            # AABB vs volume
├── ops/
│   ├── centerOnPlate.ts
│   ├── dropToBed.ts
│   └── scaleForPrint.ts
└── (fases 2-4 adicionam analyzers/, repair/, remesh/, cut/, keying/)
```

Integrações:
- `CreationContext.tsx` ganha tool `sys_print_bed`.
- `Studio3D.tsx` registra o novo object type `print_bed` e mantém `activePrinterId`.
- `Object3D.tsx` delega `print_bed` para `PrintBedObject`.
- `SidePanel.tsx` ganha aba "Print Tools".
- Bounds check roda em `Scene3D` via effect quando há bed ativo.

---

## O que preciso confirmar antes de codar a Fase 1

1. **Nome final do plugin no menu:** vou usar **"Print3D"** (Create → Systems → Print3D) e o painel **"Print Tools"**. OK?
2. **Bed default:** criar automaticamente um bed Mars 2 Pro na cena vazia, ou só quando o usuário clicar em Create → Print3D? (proponho: **só ao clicar**, coerente com Bones/Biped).
3. Posso seguir direto com a Fase 1 assim que você aprovar este plano.
