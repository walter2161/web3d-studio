// Export JSON dialog — displays a JSON snapshot of the selected objects
// with buttons to copy the payload to the clipboard or download it as a
// .json file. Mirrors the 3ds Max "Save Selected..." + a raw text preview.
import { useMemo, useState } from 'react';
import { R3Dialog, R3Button } from './R3Dialog';
import { toast } from 'sonner';

interface ExportJsonDialogProps {
  open: boolean;
  onClose: () => void;
  objects: any[]; // selected Object3DData[]
}

const stripRefs = (o: any): any => {
  if (o === null || o === undefined) return o;
  if (Array.isArray(o)) return o.map(stripRefs);
  if (typeof o === 'object') {
    const out: any = {};
    for (const k of Object.keys(o)) {
      if (k === 'ref') continue;
      try { out[k] = stripRefs(o[k]); } catch { /* skip circular */ }
    }
    return out;
  }
  return o;
};

export const ExportJsonDialog = ({ open, onClose, objects }: ExportJsonDialogProps) => {
  const json = useMemo(() => {
    try {
      const clean = objects.map(stripRefs);
      return JSON.stringify(clean, null, 2);
    } catch (e: any) {
      return `// Erro ao serializar: ${e?.message || e}`;
    }
  }, [objects, open]);

  const [copied, setCopied] = useState(false);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success('JSON copiado para a área de transferência');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Falha ao copiar');
    }
  };

  const doDownload = () => {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = objects.length === 1
        ? (objects[0]?.name || 'object')
        : `walt3d-selection-${objects.length}`;
      a.href = url;
      a.download = `${name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Arquivo JSON exportado');
    } catch {
      toast.error('Falha ao exportar arquivo');
    }
  };

  const count = objects.length;
  const title = count === 1
    ? `Export JSON — ${objects[0]?.name || 'Object'}`
    : `Export JSON — ${count} objetos selecionados`;

  return (
    <R3Dialog open={open} onClose={onClose} title={title} width={620}>
      <div className="flex flex-col gap-2">
        <div className="text-[11px] text-win-text opacity-80">
          {count === 0
            ? 'Nenhum objeto selecionado.'
            : 'Pré-visualização do JSON dos objetos selecionados. Use os botões abaixo para copiar ou salvar em arquivo.'}
        </div>
        <textarea
          readOnly
          value={json}
          className="bevel-inset bg-white text-[11px] text-win-text font-mono p-1 outline-none resize-none"
          style={{ height: 340, whiteSpace: 'pre' }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex justify-between items-center pt-1">
          <div className="text-[10px] text-win-text opacity-70">
            {json.length.toLocaleString()} bytes
          </div>
          <div className="flex gap-1">
            <R3Button width={90} onClick={doDownload} disabled={count === 0}>
              Salvar .json
            </R3Button>
            <R3Button width={90} onClick={doCopy} disabled={count === 0}>
              {copied ? 'Copiado!' : 'Copiar'}
            </R3Button>
            <R3Button width={80} onClick={onClose}>Fechar</R3Button>
          </div>
        </div>
      </div>
    </R3Dialog>
  );
};
