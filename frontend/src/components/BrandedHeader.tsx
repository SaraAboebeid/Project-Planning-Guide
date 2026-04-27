export default function BrandedHeader() {
  return (
    <header className="bg-gradient-to-r from-[#421869] via-[#721CB8] to-[#5a1490] shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        {/* Left — Logos */}
        <div className="flex items-center gap-4">
          <img
            src="/chalmers_university_logo_white.svg"
            alt="Chalmers University of Technology"
            className="h-8 opacity-90"
          />
          <span className="w-px h-6 bg-white/25" />
          <img
            src="/chalmers_next_labs_logo_white.svg"
            alt="Chalmers Next Labs"
            className="h-7 opacity-90"
          />
        </div>

        {/* Centre — Title */}
        <div className="text-center">
          <h1 className="text-white text-[15px] font-semibold tracking-wide leading-tight">
            Data Fidelity Navigator
          </h1>
          <p className="text-white/50 text-[10px] tracking-[0.18em] uppercase mt-0.5">
            Project Planning Guide
          </p>
        </div>

        {/* Right — Team */}
        <div className="text-right text-[10px] text-white/60 leading-relaxed">
          <p className="font-semibold text-white/80 tracking-[0.12em] uppercase text-[9px] mb-0.5">
            Research Team
          </p>
          <p>S. Abouebeid &nbsp;·&nbsp; E. Malakhatka</p>
          <p>L. Thuvander &nbsp;·&nbsp; H. Wallbaum</p>
        </div>
      </div>
      <div className="ppg-accent-line" />
    </header>
  );
}
