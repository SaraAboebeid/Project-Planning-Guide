export default function BrandedHeader() {
  return (
    <header className="bg-gradient-to-r from-navy via-teal to-green text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-tight">
          Project Planning Guide
        </h1>
        <span className="text-xs opacity-75">Data Fidelity Navigator</span>
      </div>
      <div className="flex items-center gap-4 text-xs opacity-80">
        <span>Chalmers Next Labs</span>
      </div>
    </header>
  );
}
