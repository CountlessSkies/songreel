import {useEffect, useState} from 'react';
import {EMPTY_ANSWERS, type Answers, type OrderView} from '../shared/catalog';
import {createOrder, getOrder, MOCK} from './api';
import {Home, type StartPrefill} from './Home';
import {MvStudio} from './MvStudio';
import {createMv, type MvRequest} from './mvApi';
import {Result} from './Result';
import {Waiting} from './Waiting';
import {Wizard} from './Wizard';

/** Giu ?mock=1 khi doi URL de tai lai trang van o che do gia lap. */
const qs = (s: string) => (MOCK ? `?mock=1&${s}` : `?${s}`);

const POLL_MS = 2000;
const PASS_KEY = 'solsongs_passcode';

export function App() {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [orderId, setOrderId] = useState<string | null>(() => new URLSearchParams(location.search).get('order'));
  const [order, setOrder] = useState<OrderView | null>(null);
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
  const [mv, setMv] = useState<{id: string; takeIdx: number} | null>(() => {
    const id = new URLSearchParams(location.search).get('mv');
    return id ? {id, takeIdx: 0} : null;
  });
  const [isMvStarting, setIsMvStarting] = useState(false);
  // Trang chu hien truoc; ?start=1 (hoac dang co don) thi vao thang bang hoi
  const [isStarted, setIsStarted] = useState(() => new URLSearchParams(location.search).has('start'));
  useEffect(() => {
    const onPop = () => setIsStarted(new URLSearchParams(location.search).has('start'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    // 'mv' la man con dung Astryx (co nut doi theme); 'home' va 'studio' tu ve giao dien rieng
    const isMv = !!orderId && order?.status === 'ready' && !!mv;
    document.body.dataset.page = !orderId && !isStarted ? 'home' : isMv ? 'mv' : 'studio';
  }, [orderId, isStarted, order?.status, mv]);

  useEffect(() => {
    if (!orderId) return;
    let stop = false;
    const tick = async () => {
      try {
        const o = await getOrder(orderId);
        if (stop) return;
        setOrder(o);
        if (o.status === 'running') window.setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!stop) window.setTimeout(tick, POLL_MS * 2);
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [orderId]);

  const makeMv = async (req: MvRequest) => {
    if (!order) return;
    setIsMvStarting(true);
    try {
      const {id} = await createMv(order, req, passcode);
      history.replaceState(null, '', qs(`order=${order.id}&mv=${id}`));
      setMv({id, takeIdx: req.takeIdx});
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setIsMvStarting(false);
    }
  };

  const closeMv = () => {
    if (order) history.replaceState(null, '', qs(`order=${order.id}`));
    setMv(null);
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
    setMv(null);
    setIsStarted(false);
    window.scrollTo({top: 0});
  };

  const reset = () => {
    history.replaceState(null, '', qs('start=1'));
    setOrderId(null);
    setOrder(null);
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
  if (order?.status === 'ready' && mv) return <MvStudio order={order} mvId={mv.id} takeIdx={mv.takeIdx} onBack={closeMv} />;
  if (order?.status === 'ready') return <Result order={order} onNew={reset} onHome={goHome} onMakeMv={makeMv} isMvStarting={isMvStarting} passcode={passcode} onPasscode={setPasscode} />;
  return <Waiting order={order} story={`${answers.memories}. ${answers.qualities}`} onRetry={reset} onHome={goHome} />;
}
