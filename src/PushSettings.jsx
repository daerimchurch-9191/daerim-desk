// 톱니 메뉴 > 앱·알림 설정: 홈 화면에 앱 추가, 휴대폰 알림 켜기/끄기
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean, can, visitRooms } from './auth.jsx'
import { useData, Modal } from './live.jsx'
import { pushState, enablePush, disablePush, sendTestPush, isIOS, isStandalone, canInstall, promptInstall } from './push.js'

const STATE_TEXT = {
  on: '이 기기에서 알림을 받고 있습니다.',
  off: '이 기기는 아직 알림을 받지 않습니다.',
  denied: '이 기기에서 알림이 차단되어 있습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 "허용"으로 바꾼 뒤 다시 열어 주세요.',
  unsupported: '이 브라우저는 알림을 지원하지 않습니다. 휴대폰은 크롬(안드로이드)이나 홈 화면 앱(아이폰)으로 열어 주세요.',
  'need-install': '아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다. 아래 방법으로 먼저 홈 화면에 추가해 주세요.',
}

// 알림 받을 항목 (notification_prefs). 저장한 적 없으면 기본값.
const PREF_DEFAULTS = { notice: true, visit: true, ads: true, cars: true, leave: true, cal_all: true, cal_mine: true, cal_edu: false, cal_parish: false, attendance: true }

function NotifyItems() {
  const { profile } = useAuth()
  const { departments, notify } = useData()
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('notification_prefs').select('*').eq('profile_id', profile.id).maybeSingle().then(({ data }) => {
      const v = { ...PREF_DEFAULTS, ...(data ? Object.fromEntries(Object.keys(PREF_DEFAULTS).map((k) => [k, data[k]])) : {}) }
      setSaved(v); setDraft(v)
    })
  }, [])
  if (!draft) return <span className="skeleton" />
  const rows = [
    { key: 'notice', name: '공지', hint: '관리자가 알림을 보내기로 한 공지' },
    visitRooms(profile, departments).length > 0 && { key: 'visit', name: '심방보고', hint: '내가 볼 수 있는 교구 방에 새 글 (내용은 알림에 보이지 않음)' },
    { key: 'ads', name: '주보 광고', hint: '새 광고가 올라올 때' },
    { key: 'cars', name: '차량 신청', hint: '새 차량 신청 (노션에서 들어온 것 포함)' },
    { key: 'attendance', name: '출석현황', hint: '한 주일 인원이 모두 입력되면 한 번' },
    { key: 'leave', name: '연차', hint: can(profile, 'leave_admin') ? '새 연차 신청, 내 연차 승인·반려' : '내 연차 승인·반려' },
    { group: '캘린더 — 어떤 일정이 새로 생길 때 받을까요?' },
    { key: 'cal_all', name: '교회 전체 일정', sub: true },
    { key: 'cal_mine', name: '내 부서 일정', sub: true, hint: '내가 속한 부서의 일정' },
    { key: 'cal_edu', name: '교육부 전체 일정', sub: true, hint: '교육부 소속이 아니어도 받기' },
  ].filter(Boolean)
  const dirty = Object.keys(PREF_DEFAULTS).some((k) => draft[k] !== saved[k])
  async function save() {
    setBusy(true); setError('')
    const { error } = await supabase.from('notification_prefs').upsert({ profile_id: profile.id, ...draft, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    setSaved(draft); notify('알림 받을 항목을 저장했습니다.')
  }
  return (
    <>
      <table className="notify-table">
        <thead><tr><th className="perm-name">항목</th><th>받기</th></tr></thead>
        <tbody>
          {rows.map((r) => r.group ? (
            <tr key={r.group} className="notify-group"><th colSpan={2} className="perm-name">{r.group}</th></tr>
          ) : (
            <tr key={r.key} className={draft[r.key] !== saved[r.key] ? 'is-dirty' : undefined}>
              <th scope="row" className={`perm-name${r.sub ? ' is-sub' : ''}`}><label htmlFor={`np-${r.key}`}><strong>{r.name}</strong>{r.hint && <small className="muted">{r.hint}</small>}</label></th>
              <td><input id={`np-${r.key}`} type="checkbox" checked={draft[r.key]} onChange={() => setDraft({ ...draft, [r.key]: !draft[r.key] })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-row">
        {dirty && <span className="chip chip-warn">저장 안 됨</span>}
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
      </div>
      <p className="muted small">내가 올린 글은 나에게 알리지 않습니다. 개인 일정은 알림이 가지 않습니다.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  )
}

// 휴대폰 화면이 상태 표시줄·버튼 줄에 가리는 문제를 점검할 때 쓰는 값 (캡처해서 보내 달라고 할 때)
function screenInfo() {
  const root = document.documentElement
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'
  root.appendChild(probe)
  const cs = getComputedStyle(probe), envT = cs.paddingTop, envB = cs.paddingBottom
  root.removeChild(probe)
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser'].filter((m) => matchMedia(`(display-mode: ${m})`).matches).join(',')
  const v = window.visualViewport
  return [
    `ver ${typeof __BUILD__ !== 'undefined' ? __BUILD__ : '-'}`,
    `mode ${modes || '없음'}`,
    `inner ${innerWidth}x${innerHeight}  outer ${outerWidth}x${outerHeight}`,
    `screen ${screen.width}x${screen.height}  avail ${screen.availWidth}x${screen.availHeight}`,
    `vv ${v ? `${Math.round(v.width)}x${Math.round(v.height)} top ${Math.round(v.offsetTop)}` : '-'}  dpr ${devicePixelRatio}`,
    `env ${envT} / ${envB}  js ${root.style.getPropertyValue('--js-sat') || '없음'} / ${root.style.getPropertyValue('--js-sab') || '없음'}`,
    `doc ${root.clientHeight}  ref ${document.referrer || '-'}`,
    navigator.userAgent,
  ].join('\n')
}

export function PushSettingsModal({ onClose }) {
  const { notify } = useData()
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [installable, setInstallable] = useState(canInstall())
  const reload = () => pushState().then(setState).catch(() => setState('unsupported'))
  useEffect(() => { reload() }, [])

  async function run(fn, okText) {
    setBusy(true); setError('')
    try { const r = await fn(); if (okText) notify(typeof okText === 'function' ? okText(r) : okText) }
    catch (e) { setError(e.message === 'denied' ? STATE_TEXT.denied : (e.message || '잠시 뒤 다시 시도해 주세요.')) }
    setBusy(false); reload()
  }

  return (
    <Modal title="앱·알림 설정" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose() }}
      footer={<button type="submit" className="btn">닫기</button>}>
      <h3 className="sub-h">이 기기 알림</h3>
      <p className="small">{state ? STATE_TEXT[state] : '확인하는 중…'}</p>
      {state === 'off' && <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => run(enablePush, '알림을 켰습니다.')}>이 기기에서 알림 받기</button>}
      {state === 'on' && (
        <div className="btn-row">
          <button type="button" className="btn" disabled={busy} onClick={() => run(sendTestPush, (r) => r?.sent ? '시험 알림을 보냈습니다. 잠시 뒤 도착합니다.' : '보낼 기기를 찾지 못했습니다. 알림을 껐다 다시 켜 주세요.')}>시험 알림 보내기</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(disablePush, '이 기기의 알림을 껐습니다.')}>알림 끄기</button>
        </div>
      )}
      <p className="muted small">기기마다 따로 켜야 합니다 (휴대폰, 사무실 컴퓨터 각각).</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <h3 className="sub-h">알림 받을 항목</h3>
      <NotifyItems />

      {!isStandalone() && <>
        <h3 className="sub-h">홈 화면에 앱으로 추가</h3>
        {installable
          ? <button type="button" className="btn btn-block" onClick={async () => { await promptInstall(); setInstallable(false) }}>앱으로 설치하기</button>
          : isIOS()
            ? <ol className="steps small"><li>사파리로 이 페이지를 엽니다.</li><li>아래쪽 공유 버튼(네모에 위쪽 화살표)을 누릅니다.</li><li>"홈 화면에 추가"를 누릅니다.</li><li>홈 화면의 "사역 데스크" 아이콘으로 열고, 여기서 알림을 켭니다.</li></ol>
            : <ol className="steps small"><li>크롬 오른쪽 위 메뉴(⋮)를 누릅니다.</li><li>"홈 화면에 추가" 또는 "앱 설치"를 누릅니다.</li></ol>}
      </>}

      <details className="screen-check">
        <summary className="small muted">화면 점검 정보</summary>
        <pre>{screenInfo()}</pre>
      </details>
    </Modal>
  )
}
