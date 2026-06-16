import { cn } from '@/lib/utils';

interface ToolPageShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function ToolPageShell({ title, description, children, className }: ToolPageShellProps) {
  return (
    <main className={cn('min-h-screen bg-background', className)}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold mb-2">{title}</h1>
        <p className="text-muted-foreground text-sm mb-8">{description}</p>
        {children}
      </div>
    </main>
  );
}
