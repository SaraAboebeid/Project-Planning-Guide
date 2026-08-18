export default function BrandedHeader() {
  return (
    <header className="bg-gradient-to-r from-[#421869] via-[#5A1790] to-[#5a1490] shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Left — Logos */}
        <div className="flex items-center gap-4">
          <img
            src="/CTH_new_logo_white.png"
            alt="Chalmers University of Technology"
            className="brand-logo h-16 opacity-90"
          />
          <span className="w-px h-6 bg-white/25" />
          <img
            src="/CNL_new_logo_white.png"
            alt="Chalmers Next Labs"
            className="brand-logo h-16 opacity-90"
          />
        </div>

        {/* Centre — Title */}
        <div className="text-center">
          <h1 className="text-white text-[15px] font-semibold tracking-wide leading-tight">
            Data Fidelity Navigator
          </h1>
          <p className="text-white/60 text-[10px] tracking-[0.18em] uppercase mt-0.5">
            Digital ToolBox
          </p>
        </div>

        {/* Right — Team */}
        <div className="text-left text-[10px] text-white/70 leading-relaxed">
          <p className="font-semibold text-white/85 tracking-[0.12em] uppercase text-[9px] mb-0.5">
            Team
          </p>
          <p>Sara Abouebeid &nbsp;·&nbsp; Elena Malakhatka</p>
          <p>Liane Thuvander &nbsp;·&nbsp; Holger Wallbaum</p>
        </div>
      </div>
    </header>
  );
}
