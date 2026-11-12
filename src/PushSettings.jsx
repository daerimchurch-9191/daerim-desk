// 톱니 메뉴 > 앱·알림 설정: 홈 화면에 앱 추가, 휴대폰 알림 켜기/끄기
import { useEffect, useState } from 'react'
import { useData, Modal } from './live.jsx'
import { pushState, enablePush, disablePush, sendTestPush, isIOS, isStandalone, canInstall, promptInstall } from './push.js'

const STATE_TEXT = {
  on: '이 기기에서 알림을 받고 있습니다.',
  off: '이 기기는 아직 알림을 받지 않습니다.',
  denied: '이 기기에서 알림이 차단되어 있습니다. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 "허용"으로 바꾼 뒤 다시 열어 주세요.',
  unsupported: '이 브라우저는 알림을 지원하지 않습니다. 휴대폰은 크롬(안드로이드)이나 홈 화면 앱(아이폰)으로 열어 주세요.',
  'need-install': '아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다. 아래 방법으로 먼저 홈 화면에 추가해 주세요.',
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
      <h3 className="sub-h">공지 알림</h3>
      <p className="small">{state ? STATE_TEXT[state] : '확인하는 중…'}</p>
      {state === 'off' && <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => run(enablePush, '알림을 켰습니다.')}>이 기기에서 알림 받기</button>}
      {state === 'on' && (
        <div className="btn-row">
          <button type="button" className="btn" disabled={busy} onClick={() => run(sendTestPush, (r) => r?.sent ? '시험 알림을 보냈습니다. 잠시 뒤 도착합니다.' : '보낼 기기를 찾지 못했습니다. 알림을 껐다 다시 켜 주세요.')}>시험 알림 보내기</button>
          <button type="button" className="btn" disabled={busy} onClick={() => run(disablePush, '이 기기의 알림을 껐습니다.')}>알림 끄기</button>
        </div>
      )}
      <p className="muted small">관리자가 새 공지를 올리면 받는 범위(전체·교구·교육부)에 맞는 사역자에게 알림이 갑니다. 기기마다 따로 켜야 합니다.</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      {!isStandalone() && <>
        <h3 className="sub-h">홈 화면에 앱으로 추가</h3>
        {installable
          ? <button type="button" className="btn btn-block" onClick={async () => { await promptInstall(); setInstallable(false) }}>앱으로 설치하기</button>
          : isIOS()
            ? <ol className="steps small"><li>사파리로 이 페이지를 엽니다.</li><li>아래쪽 공유 버튼(네모에 위쪽 화살표)을 누릅니다.</li><li>"홈 화면에 추가"를 누릅니다.</li><li>홈 화면의 "사역 데스크" 아이콘으로 열고, 여기서 알림을 켭니다.</li></ol>
            : <ol className="steps small"><li>크롬 오른쪽 위 메뉴(⋮)를 누릅니다.</li><li>"홈 화면에 추가" 또는 "앱 설치"를 누릅니다.</li></ol>}
      </>}
    </Modal>
  )
}
