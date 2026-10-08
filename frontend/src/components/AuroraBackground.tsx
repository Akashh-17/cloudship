export default function AuroraBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <div className="absolute left-1/2 top-0 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/3">
        <div className="absolute left-[10%] top-[10%] h-72 w-72 animate-aurora rounded-full bg-indigo-600/30 blur-[100px]" />
        <div className="absolute right-[10%] top-[20%] h-72 w-72 animate-aurora animation-delay-2000 rounded-full bg-violet-600/25 blur-[100px]" />
        <div className="absolute left-[35%] top-[30%] h-64 w-64 animate-aurora animation-delay-4000 rounded-full bg-fuchsia-500/15 blur-[110px]" />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,transparent_0%,hsl(0_0%_3.5%)_75%)]" />
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(0 0% 100% / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
