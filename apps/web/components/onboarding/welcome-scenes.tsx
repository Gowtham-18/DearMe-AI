/**
 * Animated scenes for the welcome slides. Each plays once when its slide comes into view
 * (`playing`), and shows its finished state straight away for people who prefer reduced motion.
 * Drawn with theme tokens so they follow light and dark mode. Decorative: the slide text carries
 * the meaning.
 */
type SceneProps = { playing: boolean; className?: string };

const accent = { stroke: "hsl(var(--accent))" };
const amber = { fill: "hsl(var(--chart-4))" };
const green = { fill: "hsl(var(--chart-3))" };
const blue = { fill: "hsl(var(--chart-2))" };

function Stage({ playing, className, label, children }: SceneProps & { label: string; children: React.ReactNode }) {
  // Remounting on play restarts every animation from the beginning.
  return (
    <svg
      key={playing ? "on" : "off"}
      viewBox="0 0 320 240"
      className={`scene ${playing ? "is-playing" : ""} ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
      data-scene={label}
    >
      <circle cx="160" cy="124" r="104" className="fill-surface-2 scene-rise" style={{ "--d": "0s" } as React.CSSProperties} />
      {children}
    </svg>
  );
}

const d = (seconds: number) => ({ "--d": `${seconds}s` }) as React.CSSProperties;

/** You write a line; a question comes back. */
export function ListenScene(props: SceneProps) {
  return (
    <Stage {...props} label="listen">
      <g transform="rotate(-5 130 130)">
        <rect x="64" y="52" width="136" height="156" rx="12" className="fill-card stroke-divider" strokeWidth="2" />
        <line x1="88" y1="52" x2="88" y2="208" style={{ stroke: "hsl(0 70% 62% / 0.45)" }} strokeWidth="2" />
        {[84, 106, 128, 150, 172].map((y) => (
          <line key={y} x1="96" y1={y} x2="186" y2={y} className="stroke-divider" strokeWidth="1.6" />
        ))}
        <path className="scene-draw stroke-foreground" style={d(0.3)} pathLength={1} d="M98 80 q8 -7 16 0 t16 0 t16 0 t16 0 t14 0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path className="scene-draw stroke-foreground" style={d(0.9)} pathLength={1} d="M98 102 q8 -6 16 0 t16 0 t16 0 t12 0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path className="scene-draw stroke-foreground" style={d(1.4)} pathLength={1} d="M98 124 q8 -6 16 0 t16 0" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
      <g className="scene-pop" style={d(2)}>
        <rect x="180" y="54" width="100" height="62" rx="20" className="fill-primary" />
        <path d="M198 114 l-6 20 l24 -20 z" className="fill-primary" />
        <text x="230" y="96" textAnchor="middle" className="fill-primary-foreground" fontSize="32" fontWeight="700">?</text>
      </g>
      <g className="scene-float" style={d(2.6)}>
        <circle cx="262" cy="150" r="6" style={amber} />
        <circle cx="282" cy="132" r="4" style={green} />
      </g>
    </Stage>
  );
}

/** A few answers become one handwritten page. */
export function PageScene(props: SceneProps) {
  return (
    <Stage {...props} label="page">
      <g className="scene-gather" style={d(1.7)}>
        <rect className="scene-slide-r" style={d(0.1)} x="58" y="56" width="120" height="30" rx="15" opacity="0.9" fill="hsl(var(--primary) / 0.16)" />
        <rect className="scene-slide-l" style={d(0.55)} x="142" y="96" width="120" height="30" rx="15" fill="hsl(var(--card))" stroke="hsl(var(--divider))" strokeWidth="2" />
        <rect className="scene-slide-r" style={d(1)} x="58" y="136" width="96" height="30" rx="15" opacity="0.9" fill="hsl(var(--primary) / 0.16)" />
      </g>
      <g className="scene-rise" style={d(2.1)}>
        <g transform="rotate(3 160 130)">
          <rect x="92" y="44" width="136" height="168" rx="10" className="fill-card stroke-divider" strokeWidth="2" />
          <line x1="114" y1="44" x2="114" y2="212" style={{ stroke: "hsl(0 70% 62% / 0.45)" }} strokeWidth="2" />
          <text x="124" y="70" className="fill-primary" fontSize="13" fontStyle="italic">Tuesday</text>
          {[92, 114, 136, 158, 180].map((y) => (
            <line key={y} x1="120" y1={y} x2="214" y2={y} className="stroke-divider" strokeWidth="1.4" />
          ))}
          <path className="scene-draw stroke-foreground" style={d(2.6)} pathLength={1} d="M122 88 q7 -6 14 0 t14 0 t14 0 t14 0 t14 0 t12 0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path className="scene-draw stroke-foreground" style={d(3.1)} pathLength={1} d="M122 110 q7 -6 14 0 t14 0 t14 0 t14 0 t12 0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path className="scene-draw stroke-foreground" style={d(3.5)} pathLength={1} d="M122 132 q7 -6 14 0 t14 0 t14 0 t14 0 t14 0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path className="scene-draw stroke-foreground" style={d(3.9)} pathLength={1} d="M122 154 q7 -6 14 0 t14 0 t12 0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </Stage>
  );
}

/** Tone over time and the themes that keep coming up. */
export function PatternsScene(props: SceneProps) {
  return (
    <Stage {...props} label="patterns">
      <rect className="scene-rise" style={d(0)} x="54" y="56" width="212" height="116" rx="16" fill="hsl(var(--card))" stroke="hsl(var(--divider))" strokeWidth="2" />
      {[82, 108, 134].map((y) => (
        <line key={y} x1="72" y1={y} x2="248" y2={y} className="stroke-divider" strokeWidth="1.4" strokeDasharray="4 5" />
      ))}
      <path
        className="scene-draw"
        style={{ ...accent, ...d(0.3) }}
        pathLength={1}
        d="M72 142 C96 138 104 104 128 112 S168 142 188 108 S228 76 248 84"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      <circle className="scene-pop" style={{ ...d(1.5), fill: "hsl(var(--accent))" }} cx="248" cy="84" r="6" />
      <g className="scene-pop" style={d(1.7)}>
        <rect x="58" y="184" width="66" height="26" rx="13" style={green} />
        <text x="91" y="201" textAnchor="middle" fontSize="11" fontWeight="600" fill="white">Work</text>
      </g>
      <g className="scene-pop" style={d(1.95)}>
        <rect x="130" y="184" width="62" height="26" rx="13" style={amber} />
        <text x="161" y="201" textAnchor="middle" fontSize="11" fontWeight="600" fill="white">Sleep</text>
      </g>
      <g className="scene-pop" style={d(2.2)}>
        <rect x="198" y="184" width="66" height="26" rx="13" style={blue} />
        <text x="231" y="201" textAnchor="middle" fontSize="11" fontWeight="600" fill="white">Family</text>
      </g>
    </Stage>
  );
}

/** The journal closes and locks: only you hold the key. */
export function PrivateScene(props: SceneProps) {
  return (
    <Stage {...props} label="private">
      <g className="scene-rise" style={d(0)}>
        <rect x="86" y="58" width="124" height="150" rx="12" className="fill-card stroke-divider" strokeWidth="2" />
        <rect x="86" y="58" width="18" height="150" rx="6" fill="hsl(var(--primary) / 0.85)" />
        {[96, 118, 140].map((y) => (
          <line key={y} x1="118" y1={y} x2="194" y2={y} className="stroke-divider" strokeWidth="1.6" />
        ))}
      </g>
      <g className="scene-pop" style={d(0.6)}>
        <circle cx="214" cy="154" r="44" fill="hsl(var(--primary))" />
        <path
          className="scene-shackle"
          style={d(1.3)}
          d="M200 150 v-12 a14 14 0 0 1 28 0 v12"
          stroke="hsl(var(--primary-foreground))"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="194" y="148" width="40" height="30" rx="7" fill="hsl(var(--primary-foreground))" />
        <circle cx="214" cy="161" r="4" fill="hsl(var(--primary))" />
      </g>
      <circle className="scene-ring" style={d(1.6)} cx="214" cy="154" r="44" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" />
    </Stage>
  );
}
