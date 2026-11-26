/** The one screen everybody sees while TAG is under maintenance. */
export function Maintenance() {
  return (
    <main style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center', boxSizing: 'border-box',
      padding: 'max(32px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
      background: 'radial-gradient(120% 70% at 50% 110%, rgba(217,84,30,.22), transparent 60%), #000',
      color: '#ede6da', textAlign: 'center', fontFamily: "'Inter Variable', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 380 }}>
        <img src="/icon.svg" alt="TAG" width={84} height={84}
          style={{ display: 'block', margin: '0 auto 30px', borderRadius: 20, boxShadow: '0 18px 50px -18px rgba(217,84,30,.6)' }} />
        <h1 style={{
          margin: 0, fontFamily: "'Archivo Variable', 'Inter Variable', system-ui, sans-serif", fontWeight: 800, fontStretch: '76%',
          fontSize: 'clamp(34px, 10vw, 46px)', lineHeight: 0.98, textWrap: 'balance' as any,
          background: 'linear-gradient(135deg, #c9a227 0%, #c98a2e 22%, #d9541e 55%, #b23a2b 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>TAG is under maintenance</h1>
        <p style={{ margin: '16px 0 0', fontSize: 16.5, lineHeight: 1.5, color: 'rgba(237,230,218,.72)', textWrap: 'balance' as any }}>
          We're making some fixes. Please check back soon.
        </p>
      </div>
    </main>
  );
}
