import {useEffect, useState} from 'react';
import {EMPTY_ANSWERS, type Answers, type OrderView} from '../shared/catalog';
import {isMvTier, type MvTier} from '../shared/mv';
import {createOrder, getOrder, MOCK, requestAcoustic} from './api';
import {Home, type StartPrefill} from './Home';
import {MvStudio} from './MvStudio';
import {createMv, type MvRequest} from './mvApi';
import {Result, type Purchase} from './Result';
import {Waiting} from './Waiting';
import {Wizard} from './Wizard';

/** Giu ?mock=1 khi doi URL de tai lai trang van o che do gia lap. */
const qs = (s: string) => (MOCK ? `?mock=1&${s}` : `?${s}`);

const POLL_MS = 2000;
const PASS_KEY = 'solsongs_passcode';

/** Xuong MV dang mo: chua co `mvId` la dang chon nguyen lieu, co roi la dang dung/xem. */
type Studio = {takeIdx: number; mvId: string | null; tier: MvTier};

function readStudio(): Studio | null {
  const p = new URLSearchParams(location.search);
  const mvId = p.get('mv');
  if (!mvId && !p.has('studio')) return null;
  const tier = p.get('tier');
  return {takeIdx: Number(p.get('take')) || 0, mvId, tier: isMvTier(tier) ? tier : 'amateur'};
}

export function App() {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [orderId, setOrderId] = useState<string | null>(() => new URLSearchParams(location.search).get('order'));
  const [order, setOrder] = useState<OrderView | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Ma truy cap ban chay thu: nho trong trinh duyet de tao MV sau khi tai lai trang
  const [passcode, setPasscodeState] = useState(() => {
    try {
      return localStorage.getItem(PASS_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const setPasscode = (v: string) => {
    setPasscodeState(v);
    try {
      localStorage.setItem(PASS_KEY, v);
    } catch {
      /* trinh duyet chan luu */
    }
  };
  // Thanh toan con gia lap nen chi nho trong phien; da dat ban acoustic thi coi nhu da tra tien
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [acousticError, setAcousticError] = useState<string | null>(null);
  const [studio, setStudio] = useState<Studio | null>(readStudio);
  const [isMvStarting, setIsMvStarting] = useState(false);
  const [mvError, setMvError] = useState<string | null>(null);
  // Trang chu hien truoc; ?start=1 (hoac dang co don) thi vao thang bang hoi
  const [isStarted, setIsStarted] = useState(() => new URLSearchParams(location.search).has('start'));
  useEffect(() => {
    const onPop = () => {
      setIsStarted(new URLSearchParams(location.search).has('start'));
      setStudio(readStudio());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    document.body.dataset.page = !orderId && !isStarted ? 'home' : 'studio';
  }, [orderId, isStarted]);

  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    const tick = async () => {
      try {
        const o = await getOrder(orderId);
        if (stop) return;
        setOrder(o);
        if (o.status === 'running' || o.acoustic?.status === 'running') window.setTimeout(tick, POLL_MS);
      } catch {
        if (!stop) window.setTimeout(tick, POLL_MS * 2);
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [orderId, pollKey]);

  const isPaid = !!purchase || !!order?.acoustic;
  const hasFilm = !!purchase?.film;

  const pay = async (p: Purchase) => {
    setPurchase(p);
    if (!p.acoustic || !order) return;
    setAcousticError(null);
    try {
      setOrder(await requestAcoustic(order.id, passcode));
      setPollKey(k => k + 1);
    } catch (e) {
      setAcousticError(e instanceof Error ? e.message : String(e));
    }
  };

  const openStudio = (takeIdx: number) => {
    if (!order) return;
    history.pushState(null, '', qs(`order=${order.id}&studio=1&take=${takeIdx}`));
    setMvError(null);
    setStudio({takeIdx, mvId: null, tier: 'amateur'});
    window.scrollTo({top: 0});
  };

  const makeMv = async (req: MvRequest, tier: MvTier) => {
    if (!order) return;
    setIsMvStarting(true);
    setMvError(null);
    try {
      const {id} = await createMv(order, req, passcode);
      history.replaceState(null, '', qs(`order=${order.id}&mv=${id}&take=${req.takeIdx}&tier=${tier}`));
      setStudio({takeIdx: req.takeIdx, mvId: id, tier});
    } catch (e) {
      setMvError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsMvStarting(false);
    }
  };

  const closeStudio = () => {
    if (order) history.pushState(null, '', qs(`order=${order.id}`));
    setStudio(null);
    window.scrollTo({top: 0});
  };

  const submit = async (a: Answers, code: string) => {
    setPasscode(code);
    setAnswers(a);
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const {id} = await createOrder(a, code);
      history.replaceState(null, '', qs(`order=${id}`));
      setOrder(null);
      setPurchase(null);
      setOrderId(id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const start = (p?: StartPrefill) => {
    setAnswers(a => ({...a, ...(p?.occ ? {occ: p.occ} : {}), ...(p?.rel ? {rel: p.rel} : {})}));
    setIsStarted(true);
    history.pushState(null, '', qs('start=1'));
    window.scrollTo({top: 0});
  };

  const goHome = () => {
    history.pushState(null, '', MOCK ? '?mock=1' : location.pathname);
    setOrderId(null);
    setOrder(null);
    setStudio(null);
    setPurchase(null);
    setIsStarted(false);
    window.scrollTo({top: 0});
  };

  const reset = () => {
    history.replaceState(null, '', qs('start=1'));
    setOrderId(null);
    setOrder(null);
    setStudio(null);
    setPurchase(null);
  };

  if (!orderId && !isStarted) return <Home onStart={start} />;
  if (!orderId) {
    return (
      <Wizard
        key={`${answers.occ}|${answers.rel}`}
        initial={answers}
        onSubmit={submit}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onHome={goHome}
      />
    );
  }
  if (order?.status === 'ready' && studio) {
    return (
      <MvStudio
        order={order}
        takeIdx={studio.takeIdx}
        mvId={studio.mvId}
        tier={studio.tier}
        hasFilm={hasFilm}
        onCreate={makeMv}
        isCreating={isMvStarting}
        createError={mvError}
        passcode={passcode}
        onPasscode={setPasscode}
        onBack={closeStudio}
        onHome={goHome}
        onNewMv={() => openStudio(studio.takeIdx)}
      />
    );
  }
  if (order?.status === 'ready') {
    return (
      <Result
        order={order}
        isPaid={isPaid}
        hasFilm={hasFilm}
        onPay={p => void pay(p)}
        acousticError={acousticError}
        onNew={reset}
        onHome={goHome}
        onOpenMv={openStudio}
      />
    );
  }
  return <Waiting order={order} story={`${answers.memories}. ${answers.qualities}`} onRetry={reset} onHome={goHome} />;
}
