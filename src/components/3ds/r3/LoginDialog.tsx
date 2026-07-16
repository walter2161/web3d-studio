import { useState } from 'react';
import { R3Dialog, R3Button, Row } from './R3Dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const LoginDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      toast.error('Login inválido');
      return;
    }
    toast.success('Autenticado');
    setPassword('');
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <R3Dialog open={open} onClose={() => onOpenChange(false)} title="Login" width={320}>
      <div className="space-y-2">
        <Row label="Email:" labelWidth={70}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]"
            autoFocus
          />
        </Row>
        <Row label="Senha:" labelWidth={70}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="bevel-inset bg-white text-[11px] px-1 flex-1 h-[18px]"
          />
        </Row>
        <div className="text-[10px] text-win-text-disabled px-1">
          Cadastro público desativado. Solicite ao admin para liberar seu acesso.
        </div>
        <div className="flex justify-end gap-1 pt-1">
          <R3Button width={70} onClick={submit} disabled={busy}>OK</R3Button>
          <R3Button width={70} onClick={() => onOpenChange(false)}>Cancel</R3Button>
        </div>
      </div>
    </R3Dialog>
  );
};
