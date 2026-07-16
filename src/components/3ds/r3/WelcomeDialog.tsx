import { useEffect, useState } from 'react';
import { R3Dialog, R3Button } from './R3Dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type Tab = 'welcome' | 'request';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: Tab;
}

export const WelcomeDialog = ({ open, onOpenChange, initialTab = 'welcome' }: Props) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
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

  const TabButton = ({ id, children }: { id: Tab; children: React.ReactNode }) => (
    <button
      onClick={() => setTab(id)}
      className={`text-[11px] px-3 py-[3px] ${tab === id ? 'bevel-raised bg-win-face' : 'bevel-inset bg-win-face-2'}`}
      style={{ marginRight: 2, marginBottom: tab === id ? -1 : 0, position: 'relative', zIndex: tab === id ? 2 : 1 }}
    >
      {children}
    </button>
  );

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

      {/* Tabs */}
      <div className="flex items-end mt-3 pl-1" style={{ borderBottom: '1px solid hsl(var(--win-face-dark))' }}>
        <TabButton id="welcome">boas-vindas</TabButton>
        <TabButton id="request">assinatura</TabButton>
      </div>

      <div className="bevel-raised bg-win-face p-2" style={{ marginTop: -1, minHeight: 200 }}>
        {tab === 'welcome' && (
          <div className="text-[11px] text-win-text leading-snug flex flex-col gap-2" style={{ textTransform: 'lowercase' }}>
            <p>
              aviso legal: o 3de.app é um modelador 3d web independente e proprietário. este projeto não possui qualquer vínculo, afiliação ou endosso com os desenvolvedores de softwares de modelagem comercial do mercado. todas as marcas e marcas registradas sugeridas ou de referência pertencem aos seus respectivos proprietários.
            </p>
            <p>
              acesso gratuito (demo): o app pode ser utilizado sem login em modo demonstração, porém com funcionalidades limitadas. para desbloquear todas as ferramentas, salvar cenas na nuvem e ter acesso completo ao 3de.app é necessário possuir uma assinatura ativa. veja a aba "assinatura" para mais detalhes.
            </p>
          </div>
        )}

        {tab === 'request' && (
          <>
            <div className="text-[11px] mb-2 leading-snug" style={{ textTransform: 'lowercase' }}>
              <p>assinatura promocional: durante o período promocional, a assinatura custa apenas <b>us$ 1,00 por mês</b>.</p>
              <p className="mt-1 opacity-80">preencha os campos abaixo para solicitar sua assinatura — o acesso é liberado manualmente pelo administrador após a confirmação do pagamento.</p>
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
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-1">
        {tab === 'welcome' ? (
          <>
            <R3Button width={80} onClick={() => onOpenChange(false)}>fechar</R3Button>
          </>
        ) : (
          <>
            <R3Button width={80} onClick={() => setTab('welcome')}>← voltar</R3Button>
            <R3Button width={160} onClick={sendRequest} disabled={sending}>
              {sending ? 'enviando...' : 'enviar pedido de registro'}
            </R3Button>
            <R3Button width={80} onClick={() => onOpenChange(false)}>fechar</R3Button>
          </>
        )}
      </div>
    </R3Dialog>
  );
};
