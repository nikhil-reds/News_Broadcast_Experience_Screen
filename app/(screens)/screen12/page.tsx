export default function Screen12Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 font-sans p-6">
      <div className="flex flex-col items-center gap-6 max-w-4xl w-full">
        <span className="text-sm px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-bold tracking-wider">
          Screen 12
        </span>
        <h1 className="text-3xl font-extrabold text-white text-center">Final Preview (Landscape)</h1>
        
        {/* Mock Landscape Screen Frame */}
        <div className="w-full max-w-[640px] aspect-[16/9] border-4 border-slate-800 bg-slate-900 rounded-2xl overflow-hidden flex flex-col justify-between p-4 relative shadow-2xl">
          <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs text-center">
            Simulated Broadcast 16:9 Landscape Monitor View
          </div>
          <div className="w-full flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] font-mono text-emerald-400 animate-pulse flex items-center gap-1">
              ● SYNC ACTIVE
            </span>
            <span className="text-[10px] font-mono text-slate-500">1080p 60fps</span>
          </div>
        </div>
      </div>
    </div>
  );
}
