'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Entry = { amount: number; at: string };
type Day = { goal: number | null; entries: Entry[] };
type ClubState = { goal: number | null; days: Record<string, Day> };

const storageKey = 'trex_club_water_v1';
const emptyState: ClubState = { goal: null, days: {} };
const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
const displayAmount = (value: number) => new Intl.NumberFormat('tr-TR').format(value);

function readState(): ClubState {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return emptyState;
    const parsed = JSON.parse(saved) as ClubState;
    return parsed && typeof parsed === 'object' && parsed.days ? parsed : emptyState;
  } catch { return emptyState; }
}

export default function ClubPage() {
  const [state, setState] = useState<ClubState>(emptyState);
  const [customAmount, setCustomAmount] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [notice, setNotice] = useState('');
  const key = useMemo(() => dateKey(), []);
  const today = state.days[key] ?? { goal: state.goal, entries: [] };
  const total = today.entries.reduce((sum, entry) => sum + entry.amount, 0);

  useEffect(() => {
    const saved = readState();
    setState(saved);
    setGoalInput(saved.goal ? String(saved.goal) : '');
  }, []);

  const save = (next: ClubState, message: string) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); setState(next); setNotice(message); }
    catch { setNotice('Kayıt saklanamadı. Tarayıcı depolama iznini kontrol et.'); }
  };
  const add = (milliliters: number) => {
    if (!Number.isInteger(milliliters) || milliliters < 1 || milliliters > 10000) { setNotice('1 ile 10.000 ml arasında tam sayı gir.'); return; }
    const current = state.days[key] ?? { goal: state.goal, entries: [] };
    save({ ...state, days: { ...state.days, [key]: { ...current, entries: [...current.entries, { amount: milliliters, at: new Date().toISOString() }] } } }, `${displayAmount(milliliters)} ml eklendi.`);
  };
  const onCustom = (event: FormEvent) => { event.preventDefault(); add(Number(customAmount)); setCustomAmount(''); };
  const onGoal = (event: FormEvent) => {
    event.preventDefault(); const goal = Number(goalInput);
    if (!Number.isInteger(goal) || goal < 1 || goal > 10000) { setNotice('1 ile 10.000 ml arasında hedef gir.'); return; }
    const current = state.days[key] ?? { goal: null, entries: [] };
    save({ ...state, goal, days: { ...state.days, [key]: { ...current, goal } } }, 'Günlük hedef kaydedildi.');
  };
  const undo = () => {
    if (!today.entries.length) return;
    save({ ...state, days: { ...state.days, [key]: { ...today, entries: today.entries.slice(0, -1) } } }, 'Son kayıt geri alındı.');
  };
  const goal = today.goal;
  const progress = goal ? Math.min(100, Math.round((total / goal) * 100)) : 0;

  return <main className="club-page"><nav><strong>TREX <span>CLUB</span></strong><Link className="nav-button" href="/">Mağazaya dön</Link></nav><section className="club-hero"><p className="eyebrow">GÜNLÜK SU TAKİBİ</p><h1>Bugün ne kadar su içtin?</h1><p>Hedefini kendin belirle, kayıtlarını yalnızca bu tarayıcıda tut.</p></section><section className="privacy-note">Kayıtlar hesabına gönderilmez ve başka cihazlara aktarılmaz. Tarayıcı verilerini silersen kayıtlar da silinir. Bu alan kişisel sağlık önerisi vermez.</section><div className="club-grid"><section className="club-card club-total"><h2>Bugün</h2><strong>{displayAmount(total)} <small>ml</small></strong><p>{goal ? `Günlük hedef: ${displayAmount(goal)} ml` : 'Henüz hedef belirlemedin.'}</p>{goal ? <><progress value={progress} max="100" /><p>{total >= goal ? 'Belirlediğin hedefe ulaştın.' : `${displayAmount(goal - total)} ml kaldı.`}</p></> : null}<div className="quick-add">{[200, 250, 500].map(value => <button key={value} onClick={() => add(value)}>+{value} ml</button>)}</div><form onSubmit={onCustom}><label>Farklı miktar (ml)<input value={customAmount} onChange={event => setCustomAmount(event.target.value)} inputMode="numeric" type="number" min="1" max="10000" placeholder="Ör. 300" /></label><button className="primary" type="submit">Ekle</button></form><button className="text-button" disabled={!today.entries.length} onClick={undo}>Son kaydı geri al</button></section><section className="club-card"><h2>Günlük hedefin</h2><p>Hedefini kendin seçebilirsin; önceki kayıtların korunur.</p><form onSubmit={onGoal}><label>Hedef (ml)<input value={goalInput} onChange={event => setGoalInput(event.target.value)} inputMode="numeric" type="number" min="1" max="10000" placeholder="Hedefini yaz" /></label><button className="primary" type="submit">Kaydet</button></form><h2 className="records-title">Bugünkü kayıtlar</h2><ul className="club-entries">{[...today.entries].reverse().map((entry, index) => <li key={`${entry.at}-${index}`}><span>{new Date(entry.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span><b>{displayAmount(entry.amount)} ml</b></li>)}{!today.entries.length ? <li><span>Bugün henüz kayıt yok.</span></li> : null}</ul></section></div>{notice ? <p className="club-notice" role="status">{notice}</p> : null}</main>;
}
