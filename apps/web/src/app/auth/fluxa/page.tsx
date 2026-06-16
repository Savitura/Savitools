import { FluxaAuthPage } from '@/components/auth/fluxa-auth';
import { SiteHeader } from '@/components/layout/site-header';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function FluxaAuthRoute() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Connect Fluxa"
        description="Link your Fluxa account to use your API keys inside SaviTools."
      >
        <FluxaAuthPage />
      </ToolPageShell>
    </>
  );
}
