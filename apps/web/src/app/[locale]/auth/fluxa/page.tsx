import { Sep24DebuggerPage } from '@/components/tools/sep24-debugger';
import { ToolPageShell } from '@/components/tools/tool-page-shell';
import { SorobanAuthEntryInspector } from '@/components/tools/soroban-auth-entry-inspector';

export default function FluxaAuthRoute() {
  return (
    <>
      <ToolPageShell
        title="SEP-24 Interactive Flow Debugger"
        description="Walk through testnet SEP-24 deposit and withdrawal sessions with a redacted request timeline."
      >
        <Sep24DebuggerPage />
      </ToolPageShell>
      <ToolPageShell
        title="Soroban Authorization Entry Inspector"
        description="Inspect SorobanAuthorizationEntry XDR: credentials, nonce, expiration, and nested invocation trees."
      >
        <SorobanAuthEntryInspector />
      </ToolPageShell>
    </>
  );
}
