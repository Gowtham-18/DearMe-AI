/**
 * Small scene illustrations for the welcome slides and the sign-in panel. Drawn with theme tokens,
 * so they follow light and dark mode. Decorative: the slide text carries the meaning.
 */
type IllustrationProps = { className?: string };

const amber = { fill: "hsl(var(--chart-4))" };
const green = { fill: "hsl(var(--chart-3))" };
const blue = { fill: "hsl(var(--chart-2))" };
const sky = { fill: "hsl(var(--accent))" };

function Frame({ className, children }: IllustrationProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 220" className={className} aria-hidden="true" focusable="false">
      <circle cx="160" cy="112" r="96" className="fill-surface-2" />
      {children}
    </svg>
  );
}

/** A notebook page and a companion asking one question. */
export function WriteIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <g transform="rotate(-4 130 120)">
        <rect x="70" y="44" width="130" height="150" rx="10" className="fill-card stroke-divider" strokeWidth="2" />
        <line x1="92" y1="44" x2="92" y2="194" style={{ stroke: "hsl(0 70% 62% / 0.5)" }} strokeWidth="2" />
        {[74, 94, 114, 134, 154, 174].map((y) => (
          <line key={y} x1="100" y1={y} x2="186" y2={y} className="stroke-divider" strokeWidth="2" />
        ))}
        <path d="M102 90 q10 -8 20 0 t20 0 t20 0" className="stroke-foreground" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M102 110 q10 -6 20 0 t20 0" className="stroke-foreground" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
      <rect x="182" y="58" width="96" height="58" rx="18" className="fill-primary" />
      <path d="M200 116 l-8 18 l22 -18 z" className="fill-primary" />
      <text x="230" y="95" textAnchor="middle" className="fill-primary-foreground" fontSize="30" fontWeight="700">?</text>
      <g transform="rotate(38 214 168)">
        <rect x="160" y="160" width="96" height="14" rx="7" style={amber} />
        <path d="M256 160 l14 7 l-14 7 z" className="fill-foreground" />
      </g>
    </Frame>
  );
}

/** Pick a mood, pick a time, pick a prompt. */
export function HowItWorksIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <g>
        <rect x="58" y="42" width="66" height="26" rx="13" className="fill-primary" />
        <text x="91" y="60" textAnchor="middle" className="fill-primary-foreground" fontSize="12" fontWeight="600">Calm</text>
        <rect x="132" y="42" width="66" height="26" rx="13" className="fill-card stroke-divider" strokeWidth="2" />
        <text x="165" y="60" textAnchor="middle" className="fill-muted-foreground" fontSize="12">Tired</text>
        <rect x="206" y="42" width="56" height="26" rx="13" className="fill-card stroke-divider" strokeWidth="2" />
        <text x="234" y="60" textAnchor="middle" className="fill-muted-foreground" fontSize="12">Sad</text>
      </g>
      <circle cx="92" cy="122" r="30" className="fill-card stroke-divider" strokeWidth="2" />
      <path d="M92 122 L92 102 M92 122 L106 130" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" />
      <text x="92" y="172" textAnchor="middle" className="fill-muted-foreground" fontSize="12">5 min</text>
      <rect x="140" y="92" width="128" height="84" rx="14" className="fill-card stroke-divider" strokeWidth="2" />
      <rect x="154" y="108" width="84" height="8" rx="4" className="fill-foreground" />
      <rect x="154" y="124" width="62" height="8" rx="4" className="fill-foreground" opacity="0.55" />
      <rect x="154" y="146" width="98" height="16" rx="8" style={sky} opacity="0.25" />
      <rect x="160" y="151" width="56" height="6" rx="3" style={sky} />
    </Frame>
  );
}

/** Tone over time and the themes that keep coming up. */
export function PatternsIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <rect x="56" y="48" width="208" height="112" rx="14" className="fill-card stroke-divider" strokeWidth="2" />
      {[76, 100, 124].map((y) => (
        <line key={y} x1="72" y1={y} x2="248" y2={y} className="stroke-divider" strokeWidth="1.5" strokeDasharray="4 5" />
      ))}
      <path d="M72 132 C96 128 104 96 128 104 S168 132 188 100 S228 70 248 78 L248 148 L72 148 Z" style={sky} opacity="0.18" />
      <path d="M72 132 C96 128 104 96 128 104 S168 132 188 100 S228 70 248 78" style={{ stroke: "hsl(var(--accent))" }} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="248" cy="78" r="5" style={sky} />
      <rect x="62" y="172" width="64" height="24" rx="12" style={green} opacity="0.9" />
      <text x="94" y="188" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">sleep</text>
      <rect x="132" y="172" width="58" height="24" rx="12" style={blue} opacity="0.9" />
      <text x="161" y="188" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">work</text>
      <rect x="196" y="172" width="64" height="24" rx="12" style={amber} opacity="0.95" />
      <text x="228" y="188" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1f2937">family</text>
    </Frame>
  );
}

/** A plan on the calendar and a gentle follow-up afterwards. */
export function RememberIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <rect x="56" y="54" width="120" height="120" rx="14" className="fill-card stroke-divider" strokeWidth="2" />
      <rect x="56" y="54" width="120" height="28" rx="14" className="fill-primary" />
      <rect x="56" y="70" width="120" height="12" className="fill-primary" />
      <text x="116" y="73" textAnchor="middle" className="fill-primary-foreground" fontSize="12" fontWeight="600">FRIDAY</text>
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={68 + col * 20}
            y={92 + row * 19}
            width="14"
            height="12"
            rx="3"
            className={row === 1 && col === 3 ? undefined : "fill-surface-2"}
            style={row === 1 && col === 3 ? amber : undefined}
          />
        ))
      )}
      <circle cx="232" cy="84" r="22" className="fill-card stroke-divider" strokeWidth="2" />
      <circle cx="232" cy="78" r="8" className="fill-muted-foreground" />
      <path d="M216 98 q16 -16 32 0" className="fill-muted-foreground" />
      <rect x="168" y="122" width="116" height="48" rx="16" className="fill-primary" />
      <path d="M190 170 l-6 14 l18 -14 z" className="fill-primary" />
      <text x="226" y="142" textAnchor="middle" className="fill-primary-foreground" fontSize="11.5" fontWeight="600">How did your</text>
      <text x="226" y="158" textAnchor="middle" className="fill-primary-foreground" fontSize="11.5" fontWeight="600">interview go?</text>
    </Frame>
  );
}

/** A journal page behind a lock. */
export function PrivateIllustration({ className }: IllustrationProps) {
  return (
    <Frame className={className}>
      <rect x="92" y="40" width="112" height="144" rx="12" className="fill-card stroke-divider" strokeWidth="2" />
      {[66, 84, 102, 120, 138, 156].map((y, i) => (
        <rect key={y} x="108" y={y} width={i % 2 ? 60 : 80} height="7" rx="3.5" className="fill-surface-2" />
      ))}
      <path d="M196 92 l40 14 v30 c0 26 -18 40 -40 48 c-22 -8 -40 -22 -40 -48 v-30 z" className="fill-primary" />
      <rect x="182" y="128" width="28" height="22" rx="5" className="fill-primary-foreground" />
      <path d="M187 128 v-7 a9 9 0 0 1 18 0 v7" className="stroke-primary-foreground" strokeWidth="4" fill="none" />
      <circle cx="196" cy="139" r="3" className="fill-primary" />
    </Frame>
  );
}
