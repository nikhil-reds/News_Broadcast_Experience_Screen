export default function Screen11Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 font-sans p-6">
      <div className="flex flex-col items-center gap-6">
        <span className="text-sm px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase font-bold tracking-wider">
          Screen 11
        </span>
        <h1 className="text-3xl font-extrabold text-white text-center">Final Preview (Portrait)</h1>
        
        {/* Mock Portrait Screen Frame */}
        <div className="w-[280px] h-[500px] border-4 border-slate-800 bg-slate-900 rounded-3xl overflow-hidden flex flex-col justify-between p-4 relative shadow-2xl">
          <div className="w-16 h-4 bg-slate-800 rounded-full mx-auto" /> {/* Speaker/Camera notch */}
          <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs text-center p-2">
            Simulated Mobile 9:16 Portrait Broadcast View
          </div>
          <div className="w-full h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center text-[10px] font-bold cursor-pointer">
            LIVE MONITOR FEED
          </div>
        </div>
      </div>
    </div>
  );
}
