// 관리자: 구글 시트 "새벽 기도 담당표" ↔ 대시보드 새벽 설교 연동 설정.
// 시트에 넣을 Apps Script 코드를 열쇠와 함께 만들어 복사해 준다 (열쇠는 이 화면에서만 받는다).
import { useEffect, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { SUPABASE_URL } from './supabase-config.js'
import { useData } from './live.jsx'

export const appsScript = (token) => `// 대림교회 사역 데스크 ↔ 새벽 기도 담당표 연동
// 시트를 고치면 바로 대시보드에, 대시보드에서 고친 것은 10분 안에 시트에 반영됩니다.
// 처음 한 번: 위쪽 함수 고르는 칸에서 "설치"를 고르고 ▶실행 → 권한 허용.
const SYNC_URL = '${SUPABASE_URL}/functions/v1/dawn-sheet-sync';
const TOKEN = '${token}';
const DAYS = ['주일', '월', '화', '수', '목', '금', '토'];

function readSheets_() {
  const ss = SpreadsheetApp.getActive();
  const rows = [], where = {};
  ss.getSheets().forEach(function (sh) {
    const lr = Math.min(sh.getLastRow() + 3, 300), lc = Math.min(sh.getLastColumn(), 40);
    if (lr < 3 || lc < 2) return;
    const v = sh.getRange(1, 1, lr, lc).getDisplayValues();
    let ym = null;
    for (let i = 0; i < Math.min(8, v.length) && !ym; i++) for (let j = 0; j < v[i].length && !ym; j++) {
      const m = String(v[i][j]).match(/(\\d{2,4})\\s*년\\s*(\\d{1,2})\\s*월/);
      if (m) ym = [Number(m[1]) < 100 ? 2000 + Number(m[1]) : Number(m[1]), Number(m[2])];
    }
    if (!ym) return;
    let hdr = -1; const cols = {};
    for (let i = 0; i < v.length && hdr < 0; i++) {
      if (v[i].some(function (c) { return String(c).trim() === '주일'; })) {
        hdr = i;
        v[i].forEach(function (c, j) { if (DAYS.indexOf(String(c).trim()) >= 0) cols[j] = true; });
      }
    }
    if (hdr < 0) return;
    for (let i = hdr + 1; i < v.length; i++) {
      const dayCols = Object.keys(cols).filter(function (j) { return /^\\d{1,2}$/.test(String(v[i][j]).trim()); });
      if (!dayCols.length) continue;
      dayCols.forEach(function (j) {
        const d = Number(String(v[i][j]).trim());
        const date = Utilities.formatString('%04d-%02d-%02d', ym[0], ym[1], d);
        rows.push({ date: date, passage: String((v[i + 1] || [])[j] || '').trim(), name: String((v[i + 2] || [])[j] || '').trim() });
        where[date] = { sheet: sh.getName(), row: i + 1, col: Number(j) + 1 };
      });
      i += 2;
    }
  });
  return { rows: rows, where: where };
}

function syncDawn() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const data = readSheets_();
    if (!data.rows.length) return;
    const res = UrlFetchApp.fetch(SYNC_URL, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-sync-token': TOKEN }, payload: JSON.stringify({ rows: data.rows }),
    });
    if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
    const out = JSON.parse(res.getContentText());
    const ss = SpreadsheetApp.getActive();
    (out.writes || []).forEach(function (w) {
      const p = data.where[w.date];
      if (!p) return;
      const sh = ss.getSheetByName(p.sheet);
      sh.getRange(p.row + 1, p.col).setValue(w.passage || '');
      sh.getRange(p.row + 2, p.col).setValue(w.name || '');
    });
  } finally {
    lock.releaseLock();
  }
}

function 설치() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncDawn').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('syncDawn').timeBased().everyMinutes(10).create();
  syncDawn();
}
`

export function SheetSyncAdmin() {
  const { notify } = useData()
  const [runs, setRuns] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('sheet_sync_runs').select('*').order('at', { ascending: false }).limit(1).then(({ data }) => setRuns(data ?? []))
  }, [])

  async function copy() {
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('get_sheet_token')
    setBusy(false)
    if (error || !data) return setError(toKorean(error?.message ?? '연동 열쇠를 받지 못했습니다.'))
    try { await navigator.clipboard.writeText(appsScript(data)); notify('연동 코드를 복사했습니다. Apps Script 편집기에 붙여 넣으세요.') }
    catch { setError('복사하지 못했습니다. 브라우저에서 클립보드 사용을 허용해 주세요.') }
  }
  const last = runs?.[0]
  const mins = last ? Math.round((Date.now() - new Date(last.at)) / 60000) : null

  return (
    <section className="block" aria-labelledby="sheet-h">
      <h2 id="sheet-h" className="pill">새벽 담당표 시트 연동</h2>
      <div className="card backup-card">
        <p className="backup-status">
          {runs === null ? '확인하는 중…'
            : !last ? '아직 연결되지 않았습니다.'
              : <><b>마지막 확인</b> {new Date(last.at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                {mins > 60 && <span className="chip chip-warn">1시간 넘게 연락이 없습니다</span>}</>}
        </p>
        <ol className="steps small">
          <li>"연동 코드 복사"를 누릅니다.</li>
          <li>구글 시트 "새벽 기도 담당표"를 열고 메뉴 <b>확장 프로그램 → Apps Script</b>로 들어갑니다. (시트 편집 권한이 있는 계정이어야 합니다)</li>
          <li>편집기에 있던 내용을 모두 지우고 붙여 넣은 뒤 저장(💾)합니다.</li>
          <li>위쪽 함수 고르는 칸에서 <b>설치</b>를 고르고 <b>▶ 실행</b>을 누릅니다. 권한을 묻는 창이 뜨면 계정을 고르고 "고급 → (안전하지 않음)으로 이동 → 허용"을 누릅니다.</li>
        </ol>
        <p className="muted small">시트를 고치면 바로 대시보드에, 대시보드에서 고친 새벽 설교는 10분 안에 시트에 반영됩니다. 같은 날을 양쪽에서 동시에 고치면 시트 쪽이 남습니다. 새 달은 시트에 같은 모양의 탭("○○년 ○월 새벽 기도 담당표" 제목, 주일~토 칸)을 만들면 저절로 연결됩니다.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={copy}>연동 코드 복사</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
