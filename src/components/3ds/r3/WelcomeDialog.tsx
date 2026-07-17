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
      toast({ title: 'Please enter your e-mail', variant: 'destructive' });
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
      toast({ title: 'Request sent', description: 'Please wait for admin approval.' });
      setEmail(''); setName(''); setReason('');
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Send error', description: e.message, variant: 'destructive' });
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
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Welcome to Walt3D" width={520}>
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
            Walt<span style={{ color: '#ffcc00' }}>3D</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] opacity-90">web 3d modeler</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-end mt-3 pl-1" style={{ borderBottom: '1px solid hsl(var(--win-face-dark))' }}>
        <TabButton id="welcome">Welcome</TabButton>
        <TabButton id="request">Subscription</TabButton>
      </div>

      <div className="bevel-raised bg-win-face p-2" style={{ marginTop: -1, minHeight: 200 }}>
        {tab === 'welcome' && (
          <div className="text-[11px] text-win-text leading-snug flex flex-col gap-2">
            <p>Legal notice: Walt3D is an independent and proprietary web 3D modeler. This project has no affiliation, association or endorsement with the developers of commercial modeling software on the market. All trademarks and registered marks referenced belong to their respective owners.</p>
            <p>Free access (demo): the app can be used without login in demonstration mode, but with limited functionality. To unlock all tools, save scenes to the cloud, and have full access to Walt3D, an active subscription is required. See the "Subscription" tab for more details.</p>
          </div>
        )}

        {tab === 'request' && (
          <>
            <div className="text-[11px] mb-2 leading-snug">
              <p>Promotional subscription: during the promotional period, the subscription costs only <b>US$ 1.00 per month</b>.</p>
              <p className="mt-1 opacity-80">Fill in the fields below to request your subscription — access is manually granted by the administrator after payment confirmation.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1">
                <span className="text-[11px]" style={{ width: 70 }}>Name:</span>
                <input
                  className="bevel-inset bg-white px-1 flex-1 outline-none"
                  style={{ height: 18 }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-[11px]" style={{ width: 70 }}>E-mail:</span>
                <input
                  type="email"
                  className="bevel-inset bg-white px-1 flex-1 outline-none"
                  style={{ height: 18 }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="flex items-start gap-1">
                <span className="text-[11px]" style={{ width: 70 }}>Reason:</span>
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
            <R3Button width={80} onClick={() => onOpenChange(false)}>Close</R3Button>
          </>
        ) : (
          <>
            <R3Button width={80} onClick={() => setTab('welcome')}>← Back</R3Button>
            <R3Button width={160} onClick={sendRequest} disabled={sending}>
              {sending ? 'Sending...' : 'Send registration request'}
            </R3Button>
            <R3Button width={80} onClick={() => onOpenChange(false)}>Close</R3Button>
          </>
        )}
      </div>
    </R3Dialog>
  );
};
