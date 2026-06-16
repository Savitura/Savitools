import { ecosystemProducts } from '@/lib/ecosystem';
import Link from 'next/link';

function ProductLogo({ name }: { name: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-xs font-semibold">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function EcosystemStrip() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
          Part of the Savitura ecosystem
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ecosystemProducts.map((product) => (
            <Link
              key={product.id}
              href={product.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-4 rounded-lg border border-border bg-background p-5 hover:border-foreground/30 transition-colors"
            >
              <ProductLogo name={product.name} />
              <div>
                <p className="text-sm font-medium group-hover:underline">{product.name}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {product.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
