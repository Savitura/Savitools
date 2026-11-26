'use client';

export function SourceAccountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="source-account-input"
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        Source Account <span className="text-rose-400">*</span>
      </label>
      <input
        id="source-account-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="G... (56-character Stellar public key)"
        maxLength={56}
        className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors"
      />
    </div>
  );
}
