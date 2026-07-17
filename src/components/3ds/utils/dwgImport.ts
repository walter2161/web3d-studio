// DWG import — converts AutoCAD DWG binary files to DXF text in-browser using
// the LibreDWG WebAssembly build, then delegates to the DXF parser to build
// wall objects. The WASM binary is served from `/libredwg/libredwg-web.wasm`
// (copied into `public/libredwg/` at build time).
//
// This lets users import .dwg files directly without a manual conversion step.

import { parseDxfFile, DxfImportResult } from './dxfImport';

let libredwgPromise: Promise<any> | null = null;

async function getLibreDwg() {
  if (!libredwgPromise) {
    libredwgPromise = (async () => {
      const { LibreDwg } = await import('@mlightcad/libredwg-web');
      // Wasm binary is copied to /public/libredwg/ so Emscripten's locateFile
      // resolves to the same origin at runtime (works in dev + build).
      return LibreDwg.create('/libredwg');
    })();
  }
  return libredwgPromise;
}

/**
 * Reads a .dwg file, converts it to DXF via LibreDWG (WASM), then parses the
 * resulting DXF text into wall specs using the existing DXF pipeline.
 */
export async function parseDwgFile(file: File): Promise<DxfImportResult> {
  const libredwg = await getLibreDwg();
  const buffer = await file.arrayBuffer();

  const dxfBytes: Uint8Array | null = libredwg.dwg_write_dxf(buffer);
  if (!dxfBytes || dxfBytes.length === 0) {
    throw new Error('LibreDWG could not convert this DWG (unsupported or corrupt file).');
  }

  // Wrap the DXF bytes as a synthetic File so we can reuse parseDxfFile.
  const dxfBlob = new Blob([dxfBytes], { type: 'application/dxf' });
  const dxfFile = new File([dxfBlob], file.name.replace(/\.dwg$/i, '.dxf'), {
    type: 'application/dxf',
  });
  return parseDxfFile(dxfFile);
}
