import {useEffect, useState} from 'react';
import {EMPTY_ANSWERS, type Answers, type OrderView} from '../shared/catalog';
import {createOrder, getOrder, MOCK} from './api';
import {MvStudio} from './MvStudio';
import {createMv, type MvRequest} from './mvApi';
import {Result} from './Result';
import {Waiting} from './Waiting';
import {Wizard} from './Wizard';

/** Giu ?mock=1 khi doi URL de tai lai trang van o che do gia lap. */
const qs = (s: string) => (MOCK ? `?mock=1&${s}` : `?${s}`);

const POLL_MS = 2000;

export function App() {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [orderId, setOrderId] = useState<string | null>(() => new URLSearchParams(location.search).get('order'));
  const [order, setOrder] = useState<OrderView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');
  const [mv, setMv] = useState<{id: string; takeIdx: number} | null>(() => {
    const id = new URLSearchParams(location.search).get('mv');
    return id ? {id, takeIdx: 0} : null;
  });
  const [isMvStarting, setIsMvStarting] = useState(false);

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

  const reset = () => {
    history.replaceState(null, '', MOCK ? '?mock=1' : location.pathname);
    setOrderId(null);
    setOrder(null);
  };

  if (!orderId) {
    return <Wizard initial={answers} onSubmit={submit} isSubmitting={isSubmitting} submitError={submitError} />;
  }
  if (order?.status === 'ready' && mv) return <MvStudio order={order} mvId={mv.id} takeIdx={mv.takeIdx} onBack={closeMv} />;
  if (order?.status === 'ready') return <Result order={order} onNew={reset} onMakeMv={makeMv} isMvStarting={isMvStarting} />;
  return <Waiting order={order} onRetry={reset} />;
}
