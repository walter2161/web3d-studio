import { useState } from 'react';
import { R3Dialog, R3Button, Row, GroupBox } from './R3Dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AdminPanelDialog = ({ open, onOpenChange }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!email || password.length < 8) {
      toast.error('Email válido e senha (min 8 caracteres) obrigatórios');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: email.trim(), password, role },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error(`Falha ao criar usuário: ${error?.message || JSON.stringify((data as any)?.error)}`);
      return;
    }
    toast.success(`Usuário liberado: ${email}`);
    setEmail(''); setPassword(''); setRole('user');
  };

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Admin — Liberar novo usuário" width={380}>
      <GroupBox title="Novo usuário">
        <Row label="Email:" labelWidth={70}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]"
          />
        </Row>
        <Row label="Senha:" labelWidth={70}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]"
          />
        </Row>
        <Row label="Role:" labelWidth={70}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            className="bevel-inset bg-white text-[11px] px-1 h-[18px]"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </Row>
      </GroupBox>
      <div className="flex justify-end gap-1 mt-2">
        <R3Button width={80} onClick={create} disabled={busy}>Criar</R3Button>
        <R3Button width={70} onClick={() => onOpenChange(false)}>Fechar</R3Button>
      </div>
    </R3Dialog>
  );
};
