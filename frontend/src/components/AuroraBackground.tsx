// Ambient animated gradient blobs, react-bits "Aurora" style. Pure CSS
// transforms (no framer-motion) so it stays cheap to keep running full-time
// behind the app -- this is decorative, not something users interact with.
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora__blob aurora__blob--one" />
      <div className="aurora__blob aurora__blob--two" />
      <div className="aurora__blob aurora__blob--three" />
      <div className="aurora__grain" />
    </div>
  );
}
