import {useId, useMemo, useRef, useState, type CSSProperties} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {Field} from '@astryxdesign/core/Field';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Layout, LayoutContent, LayoutFooter, LayoutHeader} from '@astryxdesign/core/Layout';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  DECADES, GENRES, INSTRUMENTS, MOODS, OCCASIONS, RELS, TEMPOS, VOICES,
  decadeOptions, genreOptions, instOptions, moodOptions, occOptions, relOptions,
  tempoOptions, voiceOptions, WRITERS, type Answers, type Option, type WriterKey,
} from '../shared/catalog';
import {withEmoji} from './emoji';

const STEPS = [
  {label: 'Người nhận'},
  {label: 'Dịp'},
  {label: 'Phong cách'},
  {label: 'Câu chuyện'},
  {label: 'Nhận bài'},
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const footerZone: CSSProperties = {flexBasis: 0};

function Chips({label, options, value, onChange, error, isRequired}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  isRequired?: boolean;
}) {
  const id = useId();
  return (
    <Field
      label={label}
      inputID={id}
      isGroupLabel
      isRequired={isRequired}
      status={error ? {type: 'error', message: error} : undefined}>
      <div className="chips">
        <ToggleButtonGroup
          label={label}
          type="single"
          value={value || null}
          onChange={v => onChange((v as string | null) ?? '')}>
          {options.map(o => (
            <ToggleButton key={o.value} value={o.value} label={withEmoji(o.value, o.label)} />
          ))}
        </ToggleButtonGroup>
      </div>
    </Field>
  );
}

export function Wizard({initial, onSubmit, isSubmitting, submitError}: {
  initial: Answers;
  onSubmit: (a: Answers, passcode: string) => void;
  isSubmitting: boolean;
  submitError: string | null;
}) {
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());
  const [a, setA] = useState<Answers>(initial);
  const [passcode, setPasscode] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const memRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Answers>(k: K) => (v: Answers[K]) => setA(prev => ({...prev, [k]: v}));

  const errorsByStep = useMemo<Array<Record<string, string>>>(() => {
    const s0: Record<string, string> = {};
    if (!a.rel) s0.rel = 'Chọn người nhận.';
    if (a.name.trim().length < 2) s0.name = 'Nhập tên người nhận (ít nhất 2 ký tự).';
    const s1: Record<string, string> = {};
    if (!a.occ) s1.occ = 'Chọn dịp tặng.';
    const s2: Record<string, string> = {};
    if (!a.genre) s2.genre = 'Chọn thể loại.';
    if (!a.voice) s2.voice = 'Chọn giọng hát.';
    const s3: Record<string, string> = {};
    if (a.memories.trim().length < 20) s3.memories = 'Kể ít nhất 20 ký tự để lời bài có chất liệu riêng.';
    const s4: Record<string, string> = {};
    if (!EMAIL_PATTERN.test(a.email.trim())) s4.email = 'Nhập email hợp lệ để nhận bài.';
    return [s0, s1, s2, s3, s4];
  }, [a]);

  const shown = (i: number) => (attempted.has(i) ? errorsByStep[i] : {});
  const err = shown(step);
  const isLast = step === STEPS.length - 1;

  const focusFirst = (key: string) => {
    if (key === 'name') nameRef.current?.focus();
    if (key === 'memories') memRef.current?.focus();
    if (key === 'email') emailRef.current?.focus();
  };

  const goNext = () => {
    setAttempted(prev => new Set(prev).add(step));
    const [first] = Object.keys(errorsByStep[step]);
    if (first) {
      focusFirst(first);
      return;
    }
    if (isLast) {
      const bad = errorsByStep.findIndex(e => Object.keys(e).length > 0);
      if (bad >= 0) {
        setAttempted(new Set(STEPS.map((_, i) => i)));
        setStep(bad);
        return;
      }
      onSubmit(a, passcode);
      return;
    }
    setStep(s => s + 1);
  };

  const goTo = (i: number) => {
    if (i > step) setAttempted(prev => new Set(prev).add(step));
    setStep(i);
  };

  return (
    <Layout
      height="fill"
      contentWidth={720}
      padding={isNarrow ? 4 : 5}
      defaultHasDividers
      header={
        <LayoutHeader hasDivider={false}>
          <VStack gap={isNarrow ? 3 : 5}>
            <div className="hero">
              <div className="hero-notes" aria-hidden="true"><span>🎵</span><span>🎶</span><span>💛</span></div>
              <div className="hero-logo">SolSongs</div>
              <div className="hero-sub">Kể một câu chuyện, nhận về một bài hát của riêng người ấy</div>
            </div>
            <Stepper
              activeStep={step}
              orientation="horizontal"
              onStepClick={goTo}
              label="Tiến độ bảng hỏi"
              density="balanced"
              indicatorPosition="on-track">
              {STEPS.map((s, i) => (
                <Step
                  key={s.label}
                  step={i}
                  label={s.label}
                  status={Object.keys(shown(i)).length > 0 ? 'error' : undefined}
                />
              ))}
            </Stepper>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          {step === 0 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}><span className="step-emoji">💌</span>Bài hát này dành tặng ai?</Heading>
                <Text type="supporting" color="secondary">
                  Mối quan hệ quyết định cách xưng hô trong lời bài.
                </Text>
              </VStack>
              <FormLayout>
                <Chips label="Người nhận là" options={relOptions} value={a.rel} onChange={set('rel')} error={err.rel} isRequired />
                <TextInput
                  ref={nameRef}
                  label="Tên người nhận"
                  isRequired
                 
                  value={a.name}
                  onChange={set('name')}
                  placeholder="Ví dụ: Lan"
                  description="Tên này sẽ được hát trong điệp khúc."
                  status={err.name ? {type: 'error', message: err.name} : undefined}
                />
              </FormLayout>
            </VStack>
          )}

          {step === 1 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}><span className="step-emoji">🎉</span>Nhân dịp gì?</Heading>
                <Text type="supporting" color="secondary">Dịp tặng định hướng cảm xúc của điệp khúc.</Text>
              </VStack>
              <FormLayout>
                <Chips label="Dịp tặng" options={occOptions} value={a.occ} onChange={set('occ')} error={err.occ} isRequired />
              </FormLayout>
            </VStack>
          )}

          {step === 2 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}><span className="step-emoji">🎸</span>Phong cách âm nhạc</Heading>
                <Text type="supporting" color="secondary">
                  Chọn thể loại và giọng hát. Phần tuỳ chỉnh thêm có thể bỏ qua.
                </Text>
              </VStack>
              <FormLayout>
                <Chips label="Thể loại" options={genreOptions} value={a.genre} onChange={set('genre')} error={err.genre} isRequired />
                <Chips label="Giọng hát" options={voiceOptions} value={a.voice} onChange={set('voice')} error={err.voice} isRequired />
                <Divider />
                <HStack>
                  <Button
                    label={showAdvanced ? 'Ẩn tuỳ chỉnh thêm' : 'Tuỳ chỉnh thêm (nhịp độ, cảm xúc, nhạc cụ)'}
                    variant="ghost"
                    onClick={() => setShowAdvanced(v => !v)}
                  />
                </HStack>
                {showAdvanced && (
                  <>
                    <Chips label="Nhịp độ" options={tempoOptions} value={a.tempo} onChange={set('tempo')} />
                    <Chips label="Cảm xúc" options={moodOptions} value={a.mood} onChange={set('mood')} />
                    <Chips label="Màu sắc thời đại" options={decadeOptions} value={a.decade} onChange={set('decade')} />
                    <Chips label="Nhạc cụ chủ đạo" options={instOptions} value={a.inst} onChange={set('inst')} />
                  </>
                )}
              </FormLayout>
            </VStack>
          )}

          {step === 3 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}><span className="step-emoji">📖</span>Kể câu chuyện của bạn</Heading>
                <Text type="supporting" color="secondary">
                  Càng cụ thể, lời bài càng riêng. AI chỉ dùng những gì bạn kể, không bịa thêm sự kiện.
                </Text>
              </VStack>
              <FormLayout defaultOptionality="optional">
                <TextArea
                  ref={memRef}
                  label="Những khoảnh khắc đặc biệt bên nhau"
                  isRequired
                  rows={5}
                  maxLength={1500}
                  value={a.memories}
                  onChange={set('memories')}
                  placeholder="Ví dụ: Mẹ hay nấu canh chua mỗi chiều mưa, hát ru con bằng bài Ầu ơ ví dầu..."
                  status={err.memories ? {type: 'error', message: err.memories} : undefined}
                />
                <TextArea
                  label="Những nét tính cách tuyệt vời"
                  rows={2}
                  maxLength={500}
                  value={a.qualities}
                  onChange={set('qualities')}
                  placeholder="Hiền, chịu khó, hay cười..."
                />
                <TextArea
                  label="Lời đề tặng"
                  rows={2}
                  maxLength={300}
                  value={a.dedication}
                  onChange={set('dedication')}
                  placeholder="Chúc mẹ tuổi mới luôn khoẻ mạnh"
                />
                <TextInput label="Ký tên" value={a.sender} onChange={set('sender')} placeholder="Con gái Mai" />
              </FormLayout>
            </VStack>
          )}

          {step === 4 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}><span className="step-emoji">📬</span>Nhận bài hát</Heading>
                <Text type="supporting" color="secondary">
                  Bản nghe thử sẽ có sau khoảng 1–2 phút. Bản đầy đủ gửi về email sau khi thanh toán.
                </Text>
              </VStack>
              {submitError && (
                <Banner status="error" title="Chưa tạo được bài" collapsible={false}>
                  <Text type="supporting">{submitError}</Text>
                </Banner>
              )}
              <FormLayout defaultOptionality="optional">
                <TextInput
                  ref={emailRef}
                  label="Email"
                  isRequired
                  type="email"
                  value={a.email}
                  onChange={set('email')}
                  placeholder="ban@email.com"
                  status={err.email ? {type: 'error', message: err.email} : undefined}
                />
                <TextInput label="Số Zalo" type="tel" value={a.phone} onChange={set('phone')} placeholder="09xx xxx xxx" />
                <RadioList
                  label="AI viết lời"
                  description="Bản chạy thử cho chọn model để so sánh."
                  value={a.writer}
                  onChange={v => set('writer')(v as WriterKey)}>
                  {(Object.keys(WRITERS) as WriterKey[]).map(k => (
                    <RadioListItem
                      key={k}
                      value={k}
                      label={`${k === 'sol' ? '⭐ ' : ''}${WRITERS[k].label}`}
                      description={WRITERS[k].description}
                    />
                  ))}
                </RadioList>
                <HStack>
                  <Button label="📊 Xem benchmark 3 model" variant="ghost" size="sm" href="/bench/" target="_blank" />
                </HStack>
                <TextInput
                  label="Mã truy cập bản chạy thử"
                  value={passcode}
                  onChange={setPasscode}
                  description="Bản PoC giới hạn người dùng nội bộ."
                />
              </FormLayout>
              <Divider />
              <MetadataList orientation="vertical">
                <MetadataListItem label="Người nhận">
                  {a.name.trim() || '—'} · {RELS[a.rel] ?? '—'}
                </MetadataListItem>
                <MetadataListItem label="Dịp">{OCCASIONS[a.occ] ?? '—'}</MetadataListItem>
                <MetadataListItem label="AI viết lời">{WRITERS[a.writer].label}</MetadataListItem>
                <MetadataListItem label="Phong cách">
                  {GENRES[a.genre]?.[0] ?? '—'} · {VOICES[a.voice] ?? '—'} · {TEMPOS[a.tempo][0]} ·{' '}
                  {MOODS[a.mood][0]} · {DECADES[a.decade][0]}
                  {a.inst !== 'auto' ? ` · ${INSTRUMENTS[a.inst][0]}` : ''}
                </MetadataListItem>
                <MetadataListItem label="Câu chuyện">
                  {a.memories.trim() ? `${a.memories.trim().slice(0, 90)}${a.memories.trim().length > 90 ? '…' : ''}` : '—'}
                </MetadataListItem>
              </MetadataList>
            </VStack>
          )}
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={3} vAlign="center">
            <StackItem size="fill" style={footerZone} />
            <Text type="supporting" color="secondary">
              {step + 1}/{STEPS.length}
            </Text>
            <StackItem size="fill" style={footerZone}>
              <HStack gap={3} hAlign="end">
                <Button label="Quay lại" variant="secondary" isDisabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))} />
                <Button
                  label={isLast ? '🎵 Tạo bản nghe thử' : 'Tiếp →'}
                  variant="primary"
                  isLoading={isSubmitting}
                  onClick={goNext}
                />
              </HStack>
            </StackItem>
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
