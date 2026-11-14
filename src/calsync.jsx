// 관리자: 구글 캘린더 "대림교회 배우는 숲" ↔ 대시보드 설교표 연동 설정.
// 캘린더 계정의 Apps Script(script.google.com)에 넣을 코드를 열쇠와 함께 만들어 복사해 준다.
import { useEffect, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { SUPABASE_URL } from './supabase-config.js'
import { useData } from './live.jsx'

export const calendarScript = (token) => `// 대림교회 사역 데스크 ↔ 구글 캘린더 연동
// - 제목이 "새벽 : 이름 목사", "수요 : …", "금요 : …" 인 일정 → 대시보드 설교표
// - 그 밖의 일정 → 대시보드 교회 캘린더(교회 전체)
// 캘린더를 고치면 바로 대시보드에, 대시보드에서 고친 것은 10분 안에 캘린더에 반영됩니다.
// 처음 한 번: 위쪽 함수 고르는 칸에서 "설치"를 고르고 ▶실행 → 권한 허용.
const SYNC_URL = '${SUPABASE_URL}/functions/v1/calendar-sermon-sync';
const TOKEN = '${token}';
const CAL_NAME = '대림교회 배우는 숲';
const TZ = 'Asia/Seoul';

function cal_() {
  const c = CalendarApp.getCalendarsByName(CAL_NAME)[0];
  if (c) return c;
  // 기본 캘린더는 이름이 계정 이름으로만 보일 때가 있다 → 설교 일정이 있으면 그것을 쓴다
  const d = CalendarApp.getDefaultCalendar(), now = new Date();
  const has = d.getEvents(new Date(now.getTime() - 60 * 864e5), new Date(now.getTime() + 60 * 864e5))
    .some(function (e) { return /^\\s*(새벽|수요|금요)\\s*:/.test(e.getTitle()); });
  if (has) return d;
  throw new Error('이 구글 계정에서 설교 일정("새벽 : …")이 있는 캘린더를 찾지 못했습니다. 설교표 캘린더가 있는 계정으로 설치해 주세요.');
}
function ymd_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function hm_(d) { return Utilities.formatDate(d, TZ, 'HH:mm'); }
function at_(date, time) { return new Date(date + 'T' + time + ':00+09:00'); }
function day_(iso) { return at_(ymd_(new Date(iso)), '00:00'); }

function syncSermons() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const cal = cal_();
    const today = new Date();
    const from = new Date(today.getTime() - 60 * 864e5), to = new Date(today.getTime() + 365 * 864e5);
    const map = {}, events = [], church = [];
    cal.getEvents(from, to).forEach(function (e) {
      const s = e.isAllDayEvent() ? at_(ymd_(e.getAllDayStartDate()), '00:00') : e.getStartTime();
      const key = e.isRecurringEvent() ? e.getId() + '|' + ymd_(s) : e.getId();
      map[key] = e;
      const m = e.isAllDayEvent() ? null : e.getTitle().match(/^\\s*(새벽|수요|금요)\\s*:\\s*(.*)$/);
      if (m) {
        events.push({ key: key, kind: m[1], date: ymd_(s), time: hm_(s), who: m[2].trim(), tag: e.getTag('daerim_sermon') || null });
      } else {
        const end = e.isAllDayEvent() ? at_(ymd_(e.getAllDayEndDate()), '00:00') : e.getEndTime();
        church.push({ key: key, title: e.getTitle(), allDay: e.isAllDayEvent(), start: s.toISOString(), end: end.toISOString(),
          location: e.getLocation() || '', note: e.getDescription() || '', tag: e.getTag('daerim_event') || null });
      }
    });
    const res = UrlFetchApp.fetch(SYNC_URL, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-sync-token': TOKEN },
      payload: JSON.stringify({ from: ymd_(from), to: ymd_(to), today: ymd_(today), events: events, church: church }),
    });
    if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
    const out = JSON.parse(res.getContentText());
    // 설교
    (out.updates || []).forEach(function (u) {
      const e = map[u.key]; if (!e) return;
      if (e.getTitle() !== u.title) e.setTitle(u.title);
      const s = at_(u.date, u.time), dur = e.getEndTime().getTime() - e.getStartTime().getTime();
      if (s.getTime() !== e.getStartTime().getTime()) e.setTime(s, new Date(s.getTime() + dur));
      if (u.description && e.getDescription() !== u.description) e.setDescription(u.description);
    });
    (out.creates || []).forEach(function (c) {
      const s = at_(c.date, c.time);
      const e = cal.createEvent(c.title, s, new Date(s.getTime() + 3600000), { description: c.description || '' });
      e.setTag('daerim_sermon', String(c.sermon_id));
    });
    (out.deletes || []).forEach(function (k) {
      const e = map[k]; if (!e) return;
      if (e.isRecurringEvent()) e.setTitle(e.getTitle().split(':')[0].trim() + ' : '); // 반복 일정은 이름만 비운다
      else e.deleteEvent();
    });
    // 교회 일정
    const ch = out.church || {};
    (ch.updates || []).forEach(function (u) {
      const e = map[u.key]; if (!e) return;
      if (e.getTitle() !== u.title) e.setTitle(u.title);
      if (u.allDay) e.setAllDayDates(day_(u.start), day_(u.end));
      else e.setTime(new Date(u.start), new Date(u.end));
      if ((e.getLocation() || '') !== u.location) e.setLocation(u.location);
      if ((e.getDescription() || '') !== u.note) e.setDescription(u.note);
    });
    (ch.creates || []).forEach(function (c) {
      const opt = { location: c.location || '', description: c.note || '' };
      const e = c.allDay ? cal.createAllDayEvent(c.title, day_(c.start), day_(c.end), opt) : cal.createEvent(c.title, new Date(c.start), new Date(c.end), opt);
      e.setTag('daerim_event', String(c.event_id));
    });
    (ch.deletes || []).forEach(function (k) {
      const e = map[k]; if (e && !e.isRecurringEvent()) e.deleteEvent(); // 반복 일정은 캘린더에서 직접 지운다
    });
  } finally {
    lock.releaseLock();
  }
}

function 설치() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncSermons').forUserCalendar(cal_().getId()).onEventUpdated().create();
  ScriptApp.newTrigger('syncSermons').timeBased().everyMinutes(10).create();
  syncSermons();
}
`

export function CalendarSyncAdmin() {
  const { notify } = useData()
  const [last, setLast] = useState(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('calendar_sync_runs').select('*').order('at', { ascending: false }).limit(1).then(({ data }) => setLast(data?.[0] ?? null))
  }, [])

  async function copy() {
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('get_calendar_token')
    setBusy(false)
    if (error || !data) return setError(toKorean(error?.message ?? '연동 열쇠를 받지 못했습니다.'))
    try { await navigator.clipboard.writeText(calendarScript(data)); notify('연동 코드를 복사했습니다. Apps Script 편집기에 붙여 넣으세요.') }
    catch { setError('복사하지 못했습니다. 브라우저에서 클립보드 사용을 허용해 주세요.') }
  }
  const mins = last ? Math.round((Date.now() - new Date(last.at)) / 60000) : null

  return (
    <section className="block" aria-labelledby="cal-h">
      <h2 id="cal-h" className="pill">구글 캘린더 연동 (설교표·교회 일정)</h2>
      <div className="card backup-card">
        <p className="backup-status">
          {last === undefined ? '확인하는 중…'
            : !last ? '아직 연결되지 않았습니다.'
              : <><b>마지막 확인</b> {new Date(last.at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                {mins > 60 && <span className="chip chip-warn">1시간 넘게 연락이 없습니다</span>}</>}
        </p>
        {last?.issues?.length > 0 && (
          <div className="sync-issues">
            <div className="sync-issues-head"><b>가져오지 못한 일정 {last.issues.length}</b></div>
            <ul>{last.issues.map((m) => <li key={m}><span>{m}</span></li>)}</ul>
          </div>
        )}
        <details className="howto">
          <summary>설치 방법</summary>
          <ol className="steps small">
            <li>"연동 코드 복사"를 누릅니다.</li>
            <li><b>설교표 캘린더(대림교회 배우는 숲)가 있는 구글 계정</b>으로 로그인한 상태에서 (오른쪽 위 프로필 사진으로 계정 확인) <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com 새 프로젝트</a>를 엽니다.</li>
            <li>편집기에 있던 내용을 모두 지우고 붙여 넣은 뒤 저장(💾)합니다.</li>
            <li>위쪽 함수 고르는 칸에서 <b>설치</b>를 고르고 <b>▶ 실행</b>을 누릅니다. 권한을 묻는 창이 뜨면 계정을 고르고 "고급 → (안전하지 않음)으로 이동 → 허용"을 누릅니다.</li>
          </ol>
          <p className="muted small">제목이 "새벽 : 이름 목사", "수요 : …", "금요 : …"인 일정은 설교표로, 그 밖의 일정은 교회 캘린더(교회 전체)로 들어갑니다. 대시보드에서는 "교회 전체"로 등록한 일정만 구글 캘린더로 갑니다. 캘린더를 고치면 바로, 대시보드에서 고친 것은 10분 안에 캘린더에 반영됩니다. 같은 일정을 양쪽에서 동시에 고치면 캘린더 쪽이 남습니다. 새벽은 새벽 담당표 시트와도 이어져 있어 세 곳이 함께 맞춰집니다.</p>
        </details>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={copy}>연동 코드 복사</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
