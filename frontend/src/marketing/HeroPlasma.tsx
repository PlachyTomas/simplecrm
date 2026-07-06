const ACCENT = "--color-accent-rgb";
const MAGENTA = "--color-brand-accent-rgb";

// Each blob is invisible at its animation's loop seam, so the restart reads as
// dying and being reborn elsewhere rather than snapping back to its start.
const BLOBS = [
  {
    anim: "hero-blob-1",
    token: ACCENT,
    size: "36rem",
    left: "-8%",
    top: "6%",
    core: 0.55,
    dur: "27s",
    delay: "0s",
  },
  {
    anim: "hero-blob-2",
    token: MAGENTA,
    size: "32rem",
    left: "60%",
    top: "-6%",
    core: 0.5,
    dur: "33s",
    delay: "-7s",
  },
  {
    anim: "hero-blob-3",
    token: ACCENT,
    size: "26rem",
    left: "16%",
    top: "32%",
    core: 0.45,
    dur: "29s",
    delay: "-15s",
  },
  {
    anim: "hero-blob-4",
    token: MAGENTA,
    size: "34rem",
    left: "68%",
    top: "24%",
    core: 0.5,
    dur: "37s",
    delay: "-4s",
  },
  {
    anim: "hero-blob-2",
    token: ACCENT,
    size: "24rem",
    left: "38%",
    top: "0%",
    core: 0.4,
    dur: "41s",
    delay: "-22s",
  },
  {
    anim: "hero-blob-1",
    token: MAGENTA,
    size: "28rem",
    left: "46%",
    top: "30%",
    core: 0.48,
    dur: "25s",
    delay: "-12s",
  },
];

export function HeroPlasma() {
  return (
    <>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="hero-blob"
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            opacity: 0.85,
            background: `radial-gradient(circle at center, rgb(var(${b.token}) / ${b.core}), rgb(var(${b.token}) / 0) 68%)`,
            animation: `${b.anim} ${b.dur} ease-in-out ${b.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}
