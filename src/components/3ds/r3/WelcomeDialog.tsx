import { useState } from 'react';
import { R3Dialog, R3Button } from './R3Dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WelcomeDialog = ({ open, onOpenChange }: Props) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const sendRequest = async () => {
    if (!email.trim()) {
      toast({ title: 'informe seu e-mail', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('registration_requests').insert({
        email: email.trim().toLowerCase(),
        name: name.trim() || null,
        reason: reason.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'pedido enviado', description: 'aguarde a liberação do administrador.' });
      setEmail(''); setName(''); setReason('');
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'erro ao enviar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Bem-vindo ao 3de.app" width={520}>
      {/* Banner */}
      <div
        className="bevel-inset flex items-center justify-center text-white"
        style={{
          height: 90,
          background: 'linear-gradient(135deg, #000080 0%, #1084d0 60%, #00c2ff 100%)',
        }}
      >
        <div className="text-center leading-tight">
          <div style={{ fontFamily: 'serif', fontSize: 34, fontWeight: 'bold', letterSpacing: 1 }}>
            3de<span style={{ color: '#ffcc00' }}>.app</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] opacity-90">web 3d modeler</div>
        </div>
      </div>

      {/* Disclaimer — all lowercase per spec */}
      <div className="mt-2 text-[11px] text-win-text leading-snug" style={{ textTransform: 'lowercase' }}>
        aviso legal: o 3de.app é um modelador 3d web independente e proprietário. este projeto não possui qualquer vínculo, afiliação ou endosso com os desenvolvedores de softwares de modelagem comercial do mercado. todas as marcas e marcas registradas sugeridas ou de referência pertencem aos seus respectivos proprietários.
      </div>

      {/* Registration request */}
      <div className="mt-3 bevel-group p-2">
        <div className="text-[11px] font-bold mb-1">solicitar acesso</div>
        <div className="text-[10px] mb-2 opacity-80">
          o acesso é liberado manualmente pelo administrador. envie seu pedido abaixo.
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1">
            <span className="text-[11px]" style={{ width: 70 }}>nome:</span>
            <input
              className="bevel-inset bg-white px-1 flex-1 outline-none"
              style={{ height: 18 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-[11px]" style={{ width: 70 }}>e-mail:</span>
            <input
              type="email"
              className="bevel-inset bg-white px-1 flex-1 outline-none"
              style={{ height: 18 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-1">
            <span className="text-[11px]" style={{ width: 70 }}>motivo:</span>
            <textarea
              className="bevel-inset bg-white px-1 flex-1 outline-none"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-1">
        <R3Button width={140} onClick={sendRequest} disabled={sending}>
          {sending ? 'enviando...' : 'enviar pedido de registro'}
        </R3Button>
        <R3Button width={80} onClick={() => onOpenChange(false)}>fechar</R3Button>
      </div>
    </R3Dialog>
  );
};
