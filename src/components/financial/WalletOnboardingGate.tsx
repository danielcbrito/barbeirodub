import { WalletAccountGate } from './WalletAccountGate';
interface WalletOnboardingGateProps {
  barbeiroId: string | null;
  userId?: string;
  barberName?: string;
  onBack?: () => void;
  children: React.ReactNode;
}
export function WalletOnboardingGate({ barbeiroId, barberName, onBack, children }: WalletOnboardingGateProps) {
  return <WalletAccountGate barbeiroId={barbeiroId} barberName={barberName} onBack={onBack}>{children}</WalletAccountGate>;
}
