export default function Screen12Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 font-sans p-6">
      <div className="flex flex-col items-center gap-6 max-w-4xl w-full">
        <span className="text-sm px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-bold tracking-wider">
          Screen 12
        </span>
        <h1 className="text-3xl font-extrabold text-white text-center">Final Preview (Landscape)</h1>
        
        {/* Mock Landscape Screen Frame */}
        <div className="w-full max-w-[936px] aspect-[16/9] border-8 border-slate-800 bg-slate-900 rounded-3xl overflow-hidden relative shadow-2xl ring-1 ring-slate-700/50">
          <video
            src="/vecteezy_young-businesswoman-thinking-while-working-on-the-computer_31759070.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />

          <div className="absolute bottom-4 left-4 right-4 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 flex justify-between items-center z-10 text-[10px] font-mono">
            <span className="text-emerald-400 animate-pulse flex items-center gap-1.5 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              SYNC ACTIVE
            </span>
            <span className="text-slate-400 font-bold uppercase tracking-wide">16:9 Landscape</span>
          </div>
        </div>
      </div>
    </div>
  );
}
