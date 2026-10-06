import React, { Suspense, lazy, useEffect } from 'react';
import { createHashRouter, RouterProvider, useRouteError } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { PlayerPage } from './pages/PlayerPage';
import { OpenSharedPage } from './pages/OpenSharedPage';
import { JoinPage } from './pages/JoinPage';
import { BrandMark } from './components/Brand';
import { migrateDataUrls, pruneOrphanMedia } from './lib/mediaStore';
import { onStorageChange } from './lib/storage';
import { chunkFailureAction, offlineError, reloadFlag } from './lib/offline';
import { LoadFailure, isOnlineNow, sessionStore } from './offline/LoadFailure';

// ── Code-splitting: zwaardere pagina's laden pas wanneer ze nodig zijn ──────
// (De leerlingroutes /speel, /open en /meedoen blijven in de hoofdbundel:
// die moeten meteen openen, ook op tragere schoolnetwerken.)

// Een lazy chunk kan om twee redenen niet laden:
//  - er is geen netwerk en dit deel werd op dit toestel nog nooit geopend (de
//    service worker heeft het dus niet bewaard). Herladen helpt dan niet: dat
//    eindigt in een lus of op de foutpagina van de browser. We tonen de
//    offline-melding (LoadError hieronder);
//  - na een nieuwe deploy bestaan de oude (gehashte) chunk-URL's niet meer; in
//    een tab die nog openstond zou elke klik op een lazy route stranden. Dan
//    herladen we éénmalig automatisch. Een sessionStorage-vlag per chunk
//    voorkomt een lus; na een geslaagde import wissen we ze. Kan de vlag niet
//    bewaard worden, dan herladen we niet (geen lus mogelijk).
// Welk geval het is, beslist een echte netwerkcheck (zie lib/offline.ts).
function lazyRetry<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>, chunk: string) {
  return lazy(async () => {
    const flag = `wf.chunkreload.${chunk}`;
    const store = sessionStore();
    try {
      const mod = await load();
      reloadFlag(store, flag, 'clear');
      return mod;
    } catch (err) {
      const action = chunkFailureAction(await isOnlineNow(), reloadFlag(store, flag, 'read'));
      if (action === 'offline') throw offlineError(`Offline: ${chunk}`, err);
      if (action === 'reload' && reloadFlag(store, flag, 'set') === 'set') {
        window.location.reload();
        // reload is onderweg: laat de Suspense-fallback staan
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

// De leerkrachtschil (navigatie, menu's, startpagina) hoort niet op het
// leerlingpad: een leerling met een code laadt ze nooit.
const Layout = lazyRetry(() => import('./components/Layout').then((m) => ({ default: m.Layout })), 'Layout');
const StartPage = lazyRetry(() => import('./pages/StartPage').then((m) => ({ default: m.StartPage })), 'StartPage');
const TeacherDashboard = lazyRetry(() => import('./pages/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard })), 'TeacherDashboard');
const NewWidgetPage = lazyRetry(() => import('./pages/NewWidgetPage').then((m) => ({ default: m.NewWidgetPage })), 'NewWidgetPage');
const EditorPage = lazyRetry(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })), 'EditorPage');
const ResultsPage = lazyRetry(() => import('./pages/ResultsPage').then((m) => ({ default: m.ResultsPage })), 'ResultsPage');
const ResultsOverviewPage = lazyRetry(() => import('./pages/ResultsOverviewPage').then((m) => ({ default: m.ResultsOverviewPage })), 'ResultsOverviewPage');
const PrintPage = lazyRetry(() => import('./pages/PrintPage').then((m) => ({ default: m.PrintPage })), 'PrintPage');
const PrivacyPage = lazyRetry(() => import('./pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })), 'PrivacyPage');
const ProgressPage = lazyRetry(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })), 'ProgressPage');
const HelpPage = lazyRetry(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })), 'HelpPage');
const AIStudioPage = lazyRetry(() => import('./pages/AIStudioPage').then((m) => ({ default: m.AIStudioPage })), 'AIStudioPage');
const AISettingsPage = lazyRetry(() => import('./pages/AISettingsPage').then((m) => ({ default: m.AISettingsPage })), 'AISettingsPage');
const ImportPage = lazyRetry(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })), 'ImportPage');
const CoursesPage = lazyRetry(() => import('./pages/CoursesPage').then((m) => ({ default: m.CoursesPage })), 'CoursesPage');
const CurriculaPage = lazyRetry(() => import('./pages/CurriculaPage').then((m) => ({ default: m.CurriculaPage })), 'CurriculaPage');
const MinimumdoelenPage = lazyRetry(() => import('./pages/MinimumdoelenPage').then((m) => ({ default: m.MinimumdoelenPage })), 'MinimumdoelenPage');
const LeerplanInlezenPage = lazyRetry(() => import('./pages/LeerplanInlezenPage').then((m) => ({ default: m.LeerplanInlezenPage })), 'LeerplanInlezenPage');
const SamenstellenPage = lazyRetry(() => import('./pages/SamenstellenPage').then((m) => ({ default: m.SamenstellenPage })), 'SamenstellenPage');
const CourseEditorPage = lazyRetry(() => import('./pages/CourseEditorPage').then((m) => ({ default: m.CourseEditorPage })), 'CourseEditorPage');
const CourseViewerPage = lazyRetry(() => import('./pages/CourseViewerPage').then((m) => ({ default: m.CourseViewerPage })), 'CourseViewerPage');
const CourseOpenPage = lazyRetry(() => import('./pages/CourseViewerPage').then((m) => ({ default: m.CourseOpenPage })), 'CourseViewerPage');
const CourseTrackPage = lazyRetry(() => import('./pages/CourseTrackPage').then((m) => ({ default: m.CourseTrackPage })), 'CourseTrackPage');
const CoursePrintPage = lazyRetry(() => import('./pages/CoursePrintPage').then((m) => ({ default: m.CoursePrintPage })), 'CoursePrintPage');
const ClassesPage = lazyRetry(() => import('./pages/ClassesPage').then((m) => ({ default: m.ClassesPage })), 'ClassesPage');
const ClassDashboardPage = lazyRetry(() => import('./pages/ClassDashboardPage').then((m) => ({ default: m.ClassDashboardPage })), 'ClassDashboardPage');
const InboxPage = lazyRetry(() => import('./pages/InboxPage').then((m) => ({ default: m.InboxPage })), 'InboxPage');
const ClassStudentPage = lazyRetry(() => import('./pages/ClassStudentPage').then((m) => ({ default: m.ClassStudentPage })), 'ClassStudentPage');
const ClassOpenPage = lazyRetry(() => import('./pages/ClassOpenPage').then((m) => ({ default: m.ClassOpenPage })), 'ClassOpenPage');

function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }} role="status" aria-label="Pagina wordt geladen">
      <BrandMark size={44} pulse />
    </div>
  );
}

// Nederlandstalige foutgrens i.p.v. react-routers Engelse standaardpagina.
// Offline (een chunk die op dit toestel nog niet bewaard is): een rustige
// offline-melding. Online (bv. een chunk die na een nieuwe deploy definitief
// niet meer laadt): de vraag om opnieuw te laden. Zie offline/LoadFailure.tsx.
function LoadError() {
  const error = useRouteError();
  return <LoadFailure error={error} />;
}

const lz = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;
const errorElement = <LoadError />;

const router = createHashRouter([
  // Leerlingzijde van het klassysteem, buiten de leerkrachtschil. `/klas/open`
  // staat vóór het Layout-blok zodat het niet als `/klas/:id` gelezen wordt.
  { path: '/klas/open', element: lz(<ClassOpenPage />), errorElement },
  { path: '/leerling/:classCode', element: lz(<ClassStudentPage />), errorElement },
  {
    element: lz(<Layout />),
    errorElement,
    children: [
      { path: '/', element: lz(<StartPage />) },
      { path: '/widgets', element: lz(<TeacherDashboard />) },
      { path: '/nieuw', element: lz(<NewWidgetPage />) },
      { path: '/resultaten', element: lz(<ResultsOverviewPage />) },
      { path: '/resultaten/:id', element: lz(<ResultsPage />) },
      { path: '/cursussen', element: lz(<CoursesPage />) },
      { path: '/leerplannen', element: lz(<CurriculaPage />) },
      { path: '/leerplannen/minimumdoelen', element: lz(<MinimumdoelenPage />) },
      { path: '/leerplannen/minimumdoelen/:setId', element: lz(<MinimumdoelenPage />) },
      { path: '/leerplannen/inlezen/:curriculumId?', element: lz(<LeerplanInlezenPage />) },
      { path: '/leerplannen/samenstellen/:curriculumId?', element: lz(<SamenstellenPage />) },
      { path: '/klassen', element: lz(<ClassesPage />) },
      { path: '/klas/:id', element: lz(<ClassDashboardPage />) },
      { path: '/inleverpunt', element: lz(<InboxPage />) },
      { path: '/cursus/volg/:id', element: lz(<CourseTrackPage />) },
      { path: '/importeren', element: lz(<ImportPage />) },
      { path: '/ai-studio', element: lz(<AIStudioPage />) },
      { path: '/ai-instellingen', element: lz(<AISettingsPage />) },
      { path: '/hulp', element: lz(<HelpPage />) },
      { path: '/privacy', element: lz(<PrivacyPage />) },
    ],
  },
  // spelersweergave zonder leerkracht-navigatie
  { path: '/bewerk/:id', element: lz(<EditorPage />), errorElement },
  { path: '/print/:id', element: lz(<PrintPage />), errorElement },
  { path: '/speel/:code', element: <PlayerPage />, errorElement },
  { path: '/open', element: <OpenSharedPage />, errorElement },
  { path: '/meedoen', element: <JoinPage />, errorElement },
  { path: '/voortgang', element: lz(<ProgressPage />), errorElement },
  // cursussen: leerlingweergave en bewerken zonder leerkracht-navigatie
  { path: '/cursus/bewerk/:id', element: lz(<CourseEditorPage />), errorElement },
  { path: '/cursus/lees/:code', element: lz(<CourseViewerPage />), errorElement },
  { path: '/cursus/open', element: lz(<CourseOpenPage />), errorElement },
  { path: '/cursus/print/:id', element: lz(<CoursePrintPage />), errorElement },
  { path: '*', element: <JoinPage />, errorElement },
]);

// De documenttitel volgt de route (een schermlezer leest hem bij het laden voor).
// Lui geladen: de titeltabel hoort niet in het kritieke leerlingpad (budget).
void import('./lib/paginaTitel').then((m) => m.volgRoute(router)).catch(() => { /* niet geladen (offline): de standaardtitel blijft staan */ });

export default function App() {
  useEffect(() => {
    // Media-onderhoud, altijd buiten het kritieke pad:
    //  – data-URL's die nog in localStorage staan (oude opslag, import, link,
    //    resultaatcode, AI) verhuizen naar IndexedDB — kort na elke wijziging,
    //    ontdubbeld, zodat de opslag nooit meer volloopt met base64;
    //  – bij het opstarten één keer wezen opruimen (blobs zonder verwijzing).
    let timer: number | null = null;
    const schedule = (delay: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void migrateDataUrls().catch(() => { /* best-effort */ });
      }, delay);
    };
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const maintenance = () => {
      void migrateDataUrls()
        .then(() => pruneOrphanMedia())
        .catch(() => { /* best-effort */ });
    };
    const idleHandle = hasIdle ? window.requestIdleCallback(maintenance) : window.setTimeout(maintenance, 800);
    const off = onStorageChange(() => schedule(2500));
    return () => {
      off();
      if (timer !== null) window.clearTimeout(timer);
      if (hasIdle) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, []);
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
