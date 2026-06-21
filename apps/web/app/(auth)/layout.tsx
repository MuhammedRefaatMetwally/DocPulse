export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      {/* Subtle ambient glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/[0.03] blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-7 h-7 rounded-md bg-accent-dim flex items-center justify-center">
            <span className="text-accent font-mono text-sm font-bold">D</span>
          </div>
          <span className="font-semibold text-lg tracking-tight">DocPulse</span>
        </div>

        <div className="bg-surface border border-border rounded-lg p-8">
          {children}
        </div>
      </div>
    </div>
  );
}