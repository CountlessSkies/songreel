import {useEffect, useState} from 'react';
import {EMPTY_ANSWERS, type Answers, type OrderView} from '../shared/catalog';
import {createOrder, getOrder} from './api';
import {Result} from './Result';
import {Waiting} from './Waiting';
import {Wizard} from './Wizard';

const POLL_MS = 2000;

export function App() {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [orderId, setOrderId] = useState<string | null>(() => new URLSearchParams(location.search).get('order'));
  const [order, setOrder] = useState<OrderView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const submit = async (a: Answers, passcode: string) => {
    setAnswers(a);
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const {id} = await createOrder(a, passcode);
      history.replaceState(null, '', `?order=${id}`);
      setOrder(null);
      setOrderId(id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    history.replaceState(null, '', location.pathname);
    setOrderId(null);
    setOrder(null);
  };

  if (!orderId) {
    return <Wizard initial={answers} onSubmit={submit} isSubmitting={isSubmitting} submitError={submitError} />;
  }
  if (order?.status === 'ready') return <Result order={order} onNew={reset} />;
  return <Waiting order={order} onRetry={reset} />;
}
