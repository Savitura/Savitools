import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Page Not Found</h2>
        <p className="text-muted-foreground text-sm">
          Could not find the requested resource.
        </p>
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
