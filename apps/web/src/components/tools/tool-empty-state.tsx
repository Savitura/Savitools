import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface ToolEmptyStateProps {
  message: string;
  exampleLabel: string;
  onExample: () => void;
  className?: string;
}

export function ToolEmptyState({
  message,
  exampleLabel,
  onExample,
  className,
}: ToolEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 py-16 text-center',
        className,
      )}
    >
      <Sparkles className="h-8 w-8 text-muted-foreground mb-4" />
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{message}</p>
      <button
        type="button"
        onClick={onExample}
        className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        {exampleLabel}
      </button>
    </div>
  );
}
