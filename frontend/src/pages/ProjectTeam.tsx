import { Mail, ExternalLink } from "lucide-react";

/* ── Team ─────────────────────────────────────────────────────────────
   Bios are role/contribution-focused placeholders — refine the wording per
   person as needed. `link` is optional — an email (mailto:) or a profile URL.
   A coloured accent bar down the left edge stands in for the removed avatar so
   each card still reads as a distinct person at a glance. */

type Member = {
  name: string;
  role: string;
  roleColor: string;
  bio: string;
  link?: { href: string; label: string; kind: "email" | "url" } | null;
};

const TEAM: Member[] = [
  {
    name: "Sara Abouebeid",
    role: "Lead Developer",
    roleColor: "#4ECDC4",
    bio: "Leads the design and development of the platform — the data pipelines, the building-energy analysis engine, the 3D digital-twin viewer and the planning wizard that ties them together. Responsible for turning the research models into a working, end-to-end tool.",
    link: { href: "mailto:saraabo@chalmers.se", label: "saraabo@chalmers.se", kind: "email" },
  },
  {
    name: "Holger Wallbaum",
    role: "Project Lead",
    roleColor: "#B98BE8",
    bio: "Project lead, setting the overall research direction and ensuring the work stays grounded in sustainable building practice. Brings the strategic and scientific oversight that connects the platform to wider goals in the built environment.",
    link: { href: "mailto:holger.wallbaum@chalmers.se", label: "holger.wallbaum@chalmers.se", kind: "email" },
  },
  {
    name: "Liane Thuvander",
    role: "Project Lead",
    roleColor: "#B98BE8",
    bio: "Project lead, guiding the methodology and the link between the digital-twin approach and real renovation and energy-district decision-making. Anchors the platform in applied research on the existing building stock.",
    link: { href: "mailto:liane.thuvander@chalmers.se", label: "liane.thuvander@chalmers.se", kind: "email" },
  },
  {
    name: "Elena Malakhatka",
    role: "Business Development & Sales",
    roleColor: "#F59E0B",
    bio: "Leads business development and sales, connecting the platform with building owners, municipalities and industry partners. Translates the tool's capabilities into real-world adoption and long-term impact.",
    link: { href: "mailto:elenamal@chalmers.se", label: "elenamal@chalmers.se", kind: "email" },
  },
];

function MemberCard({ m }: { m: Member }) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderLeft: `3px solid ${m.roleColor}`,
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        transition: "box-shadow .2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 4px 24px ${m.roleColor}22`)}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f4ff", lineHeight: 1.2 }}>{m.name}</div>
        <span
          style={{
            display: "inline-block",
            marginTop: 8,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            padding: "3px 10px",
            borderRadius: 100,
            background: `${m.roleColor}18`,
            color: m.roleColor,
            border: `1px solid ${m.roleColor}3a`,
          }}
        >
          {m.role}
        </span>
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", margin: 0 }}>{m.bio}</p>

      {m.link && (
        <a
          href={m.link.href}
          target={m.link.kind === "url" ? "_blank" : undefined}
          rel={m.link.kind === "url" ? "noopener noreferrer" : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: m.roleColor,
            textDecoration: "none",
            opacity: 0.9,
          }}
        >
          {m.link.kind === "email" ? <Mail size={13} /> : <ExternalLink size={13} />}
          {m.link.label}
        </a>
      )}
    </div>
  );
}

export default function ProjectTeam() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 8px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
          ABOUT
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f0f4ff", margin: 0, lineHeight: 1.2 }}>Project Team</h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginTop: 8, lineHeight: 1.6 }}>
          The team behind the platform — research leadership, development and business development working together to bring the digital twin from research into practice.
        </p>
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        {TEAM.map((m) => (
          <MemberCard key={m.name} m={m} />
        ))}
      </div>
    </div>
  );
}
