/* Hub-and-spoke automation diagram, flowing top → bottom: a trigger flows down
   into an AI core, which fans out to your tools. Nodes + flowing data packets. */

type Node = { id: string; x: number; y: number; label: string; sub: string; hub?: boolean };

const NODES: Node[] = [
  { id: "trigger", x: 180, y: 48, label: "Trigger", sub: "form · email · chat" },
  { id: "ai", x: 180, y: 190, label: "AI Core", sub: "reason · decide", hub: true },
  { id: "crm", x: 66, y: 330, label: "CRM", sub: "logged" },
  { id: "notify", x: 180, y: 330, label: "Notify", sub: "Slack" },
  { id: "docs", x: 294, y: 330, label: "Database", sub: "Airtable" },
];

const EDGES = [
  ["trigger", "ai"],
  ["ai", "crm"],
  ["ai", "notify"],
  ["ai", "docs"],
] as const;

function nodeById(id: string) {
  return NODES.find((n) => n.id === id)!;
}

function edgePath(a: Node, b: Node) {
  const my = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
}

export function WorkflowGraph() {
  return (
    <svg
      viewBox="0 0 360 384"
      className="mx-auto w-full max-w-sm"
      role="img"
      aria-label="AI automation workflow diagram"
    >
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="hubGlow">
          <stop offset="0%" stopColor="var(--color-gold-bright)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* edges */}
      {EDGES.map(([a, b], i) => {
        const d = edgePath(nodeById(a), nodeById(b));
        return (
          <g key={`${a}-${b}`}>
            <path d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" />
            <path
              d={d}
              fill="none"
              stroke="url(#edge)"
              strokeWidth="2"
              strokeDasharray="6 10"
              style={{ animation: `dashflow ${3 + i * 0.4}s linear infinite` }}
            />
            {/* data packet */}
            <circle r="3.2" fill="var(--color-cyan)">
              <animateMotion dur={`${2.4 + i * 0.5}s`} repeatCount="indefinite" path={d} />
            </circle>
          </g>
        );
      })}

      {/* nodes */}
      {NODES.map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
          {n.hub && <circle r="34" fill="url(#hubGlow)" />}
          <circle
            r={n.hub ? 16 : 9}
            fill={n.hub ? "var(--color-gold)" : "var(--color-base)"}
            stroke={n.hub ? "var(--color-gold-bright)" : "var(--color-line-strong)"}
            strokeWidth="1.5"
          />
          {n.hub && (
            <circle r="16" fill="none" stroke="var(--color-gold-bright)" strokeWidth="1.5" opacity="0.5">
              <animate attributeName="r" values="16;26;16" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
            </circle>
          )}
          <text
            x="0"
            y={n.hub ? 40 : 26}
            textAnchor="middle"
            className="fill-foreground font-[family-name:var(--font-display)]"
            fontSize="13"
            fontWeight="600"
          >
            {n.label}
          </text>
          <text
            x="0"
            y={n.hub ? 56 : 40}
            textAnchor="middle"
            className="fill-[var(--color-faint)] font-[family-name:var(--font-jetbrains)]"
            fontSize="9"
          >
            {n.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}
