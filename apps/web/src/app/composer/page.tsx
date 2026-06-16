import { SiteHeader } from '@/components/layout/site-header';
import { ComposerTool } from '@/components/tools/other-tools';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

export default function ComposerPage() {
  return (
    <>
      <SiteHeader />
      <ToolPageShell
        title="Transaction Composer"
        description="Visual builder for multi-operation Stellar transactions."
      >
        <ComposerTool />
      </ToolPageShell>
    </>
  );
}
