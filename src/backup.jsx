// 관리자: 자동 백업 설정. 구글 Apps Script(구글 서버에서 실행)가 매주 월·목 새벽 3시에
// backup-export를 불러 구글 드라이브 "대림 대시보드 백업" 폴더에 JSON 파일로 저장한다. 컴퓨터가 꺼져 있어도 된다.
// 백업 열쇠는 이 화면에서 복사하는 코드 안에만 들어간다 (채팅·깃허브에 남기지 않기 위해).
import { useEffect, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { SUPABASE_URL } from './supabase-config.js'
import { useData } from './live.jsx'

const script = (token) => `// 대림교회 사역 데스크 → 구글 드라이브 자동 백업
// 처음 한 번: 위 메뉴에서 함수 "설치"를 고르고 ▶ 실행 → 권한 허용. 그 뒤로는 매주 월·목 새벽 3시에 자동으로 백업합니다.
const URL_ = '${SUPABASE_URL}/functions/v1/backup-export';
const TOKEN_ = '${token}';
const FOLDER_ = '대림 대시보드 백업';

function 백업() {
  const res = UrlFetchApp.fetch(URL_, { headers: { 'x-backup-token': TOKEN_ }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('백업 실패 (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  const it = DriveApp.getFoldersByName(FOLDER_);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_);
  const day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  folder.createFile(res.getBlob().setName('daerim-desk-' + day + '.json'));
}

function 설치() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === '백업') ScriptApp.deleteTrigger(t); });
  [ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.THURSDAY].forEach(function (d) {
    ScriptApp.newTrigger('백업').timeBased().onWeekDay(d).atHour(3).inTimezone('Asia/Seoul').create();
  });
  백업();
}
`

export function BackupAdmin() {
  const { notify } = useData()
  const [runs, setRuns] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('backup_runs').select('*').order('at', { ascending: false }).limit(5).then(({ data }) => setRuns(data ?? []))
  }, [])

  async function copy(token, msg) {
    try {
      await navigator.clipboard.writeText(script(token))
      notify(msg)
    } catch {
      setError('복사하지 못했습니다. 다시 눌러 주세요.')
    }
  }
  async function getCode() {
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('get_backup_token')
    setBusy(false)
    if (error || !data) return setError(toKorean(error?.message ?? '백업 열쇠를 받지 못했습니다.'))
    copy(data, '백업 코드를 복사했습니다.')
  }
  async function rotate() {
    if (!window.confirm('백업 열쇠를 바꾸면 예전에 설치한 백업 코드는 더 이상 작동하지 않습니다. 새 코드로 바꿔 붙여야 합니다. 바꿀까요?')) return
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('rotate_backup_token')
    setBusy(false)
    if (error || !data) return setError(toKorean(error?.message ?? '열쇠를 바꾸지 못했습니다.'))
    copy(data, '열쇠를 바꾸고 새 백업 코드를 복사했습니다.')
  }
  const last = runs?.[0]
  const ago = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null

  return (
    <section className="block" aria-labelledby="backup-h">
      <h2 id="backup-h" className="pill">자동 백업 (구글 드라이브)</h2>
      <div className="card backup-card">
        <p className="backup-status">
          {runs === null ? '확인하는 중…'
            : !last ? <>아직 백업한 적이 없습니다.</>
              : <><b>마지막 백업</b> {new Date(last.at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} · {Math.round(last.bytes / 1024)}KB
                {ago >= 5 && <span className="chip chip-warn">{ago}일째 백업이 없습니다</span>}</>}
        </p>
        <details className="howto">
          <summary>설치 방법</summary>
          <ol className="steps small">
            <li>"백업 코드 복사"를 누릅니다.</li>
            <li>백업을 보관할 구글 계정으로 <b>script.google.com</b>에 들어가 "새 프로젝트"를 만들고, 원래 있던 글을 지운 뒤 붙여 넣고 저장합니다.</li>
            <li>위쪽 함수 목록에서 <b>설치</b>를 고르고 ▶ 실행 → 권한을 허용합니다. 바로 한 번 백업하고, 그 뒤로는 매주 월·목 새벽 3시에 드라이브 "대림 대시보드 백업" 폴더로 자동 백업합니다. 컴퓨터가 꺼져 있어도 됩니다.</li>
          </ol>
          <p className="muted small">백업 파일에는 심방보고를 포함한 모든 기록이 들어 있습니다. 백업 폴더는 다른 사람과 공유하지 마세요. 백업 파일은 지우지 않고 모두 보관합니다. 비밀번호는 백업되지 않습니다. 백업이 실패하면 구글이 그 계정 메일로 알려 줍니다.</p>
        </details>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={getCode}>백업 코드 복사</button>
          <button type="button" className="btn" disabled={busy} onClick={rotate}>열쇠 바꾸기</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
