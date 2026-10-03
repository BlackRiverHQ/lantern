import { ProtocolProvider } from "@/components/protocol";
import { Shell } from "@/components/Shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtocolProvider>
      <Shell>{children}</Shell>
    </ProtocolProvider>
  );
}
