import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Landing from './screens/Landing';
import { Forgot, Permissions, ResetPassword, Selfie, SignIn, SignUp, Welcome } from './screens/Auth';
import Home from './screens/Home';
import { useSession } from './lib/session';
import { Backdrop, Orbit } from './components/Art';

const RoomScreen = lazy(() => import('./screens/Room'));

function Splash() {
  return <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center' }}><Orbit size={44} /></div>;
}

function RequireAuth({ children, allowNoSelfie }: { children: ReactNode; allowNoSelfie?: boolean }) {
  const { session, profile, ready } = useSession();
  if (!ready) return <Splash />;
  if (!session) return <Navigate to="/" replace />;
  if (!profile) return <Splash />;
  if (!allowNoSelfie && !profile.selfie_path) return <Navigate to="/setup/permissions" replace />;
  return <>{children}</>;
}

function Entry() {
  const { session, profile, ready } = useSession();
  if (!ready) return <Splash />;
  if (session && profile) return <Navigate to={profile.selfie_path ? '/home' : '/setup/permissions'} replace />;
  if (session && !profile) return <Splash />;
  return <Welcome />;
}

export default function App() {
  const [intro, setIntro] = useState(() => !sessionStorage.getItem('tag-intro'));
  const { recovering } = useSession();
  const loc = useLocation();
  const done = () => { sessionStorage.setItem('tag-intro', '1'); setIntro(false); };

  if (recovering && loc.pathname !== '/reset') return <Navigate to="/reset" replace />;
  return (
    <>
      <Backdrop />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100%' }}>
      <AnimatePresence>{intro && loc.pathname !== '/reset' && <Landing key="intro" onDone={done} />}</AnimatePresence>
      {!intro || loc.pathname === '/reset' ? (
        <Suspense fallback={<Splash />}>
          <Routes location={loc} key={loc.pathname.startsWith('/home') ? '/home' : loc.pathname}>
            <Route path="/" element={<Entry />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route path="/setup/permissions" element={<RequireAuth allowNoSelfie><Permissions /></RequireAuth>} />
            <Route path="/setup/selfie" element={<RequireAuth allowNoSelfie><Selfie /></RequireAuth>} />
            <Route path="/selfie" element={<RequireAuth><Selfie retake /></RequireAuth>} />
            <Route path="/home/*" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/room/:id" element={<RequireAuth><RoomScreen /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      ) : null}
      </div>
    </>
  );
}
