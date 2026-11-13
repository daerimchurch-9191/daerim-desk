// 관리자: 자동 백업 설정. 교회 컴퓨터에서 한 번 실행하면 매주 토요일 나스 폴더에 백업 파일을 저장한다.
// 백업 열쇠는 이 화면에서만 받는다 (채팅·깃허브에 남기지 않기 위해).
import { useEffect, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { SUPABASE_URL } from './supabase-config.js'
import { useData } from './live.jsx'

const script = (token) => `@echo off
set "DD_SELF=%~f0"
set "DD_AUTO=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-Content -LiteralPath $env:DD_SELF -Encoding UTF8; iex ($c[6..($c.Length-1)] -join [char]10)"
exit /b
# ---- 대림교회 사역 데스크 자동 백업 (이 파일을 백업을 모아 둘 나스 폴더에 넣고 두 번 클릭) ----
$ErrorActionPreference = 'Stop'
$self = $env:DD_SELF
$dir = Split-Path -Parent $self
$auto = ($env:DD_AUTO -eq 'auto')
$url = '${SUPABASE_URL}/functions/v1/backup-export'
$token = '${token}'
$log = Join-Path $dir 'backup-log.txt'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $file = Join-Path $dir ('daerim-desk-' + (Get-Date -Format 'yyyy-MM-dd') + '.json')
  Invoke-WebRequest -Uri $url -Headers @{ 'x-backup-token' = $token } -OutFile $file -UseBasicParsing
  $kb = [math]::Round((Get-Item $file).Length / 1KB)
  Add-Content $log ('{0} 성공 {1}KB' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $kb)
  if (-not $auto) {
    Write-Host ''
    Write-Host ('백업 완료: ' + $file + ' (' + $kb + 'KB)')
    try {
      $act = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c ""' + $self + '" auto"')
      $trg = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At '12:00'
      $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -Hidden -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
      Register-ScheduledTask -TaskName 'DaerimDeskBackup' -Action $act -Trigger $trg -Settings $set -Force | Out-Null
      Write-Host '이제 매주 토요일 낮 12시에 이 폴더로 자동 백업합니다. (그 시간에 컴퓨터가 꺼져 있었으면 켜진 뒤 바로)'
    } catch {
      Write-Host ('자동 실행 등록은 실패했습니다: ' + $_.Exception.Message)
      Write-Host '파일을 오른쪽 클릭해 "관리자 권한으로 실행"으로 한 번 더 실행해 주세요.'
    }
  }
} catch {
  Add-Content $log ('{0} 실패 {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $_.Exception.Message)
  if (-not $auto) { Write-Host ('백업 실패: ' + $_.Exception.Message) }
}
if (-not $auto) { Read-Host '엔터를 누르면 창이 닫힙니다' | Out-Null }
`

export function BackupAdmin() {
  const { notify } = useData()
  const [runs, setRuns] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('backup_runs').select('*').order('at', { ascending: false }).limit(5).then(({ data }) => setRuns(data ?? []))
  }, [])

  function save(token) {
    const blob = new Blob([script(token).replace(/\n/g, '\r\n')], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = '대시보드백업.bat'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  async function download() {
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('get_backup_token')
    setBusy(false)
    if (error || !data) return setError(toKorean(error?.message ?? '백업 열쇠를 받지 못했습니다.'))
    save(data); notify('백업 프로그램을 내려받았습니다.')
  }
  async function rotate() {
    if (!window.confirm('백업 열쇠를 바꾸면 이전에 받은 백업 프로그램은 더 이상 작동하지 않습니다. 새 프로그램을 받아 교체해야 합니다. 바꿀까요?')) return
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('rotate_backup_token')
    setBusy(false)
    if (error || !data) return setError(toKorean(error?.message ?? '열쇠를 바꾸지 못했습니다.'))
    save(data); notify('열쇠를 바꾸고 새 백업 프로그램을 내려받았습니다.')
  }
  const last = runs?.[0]
  const ago = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null

  return (
    <section className="block" aria-labelledby="backup-h">
      <h2 id="backup-h" className="pill">자동 백업</h2>
      <div className="card backup-card">
        <p className="backup-status">
          {runs === null ? '확인하는 중…'
            : !last ? <>아직 백업한 적이 없습니다.</>
              : <><b>마지막 백업</b> {new Date(last.at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} · {Math.round(last.bytes / 1024)}KB
                {ago >= 9 && <span className="chip chip-warn">{ago}일째 백업이 없습니다</span>}</>}
        </p>
        <ol className="steps small">
          <li>"백업 프로그램 받기"로 <b>대시보드백업.bat</b>을 내려받습니다.</li>
          <li>교회 컴퓨터에서 이 파일을 백업을 모아 둘 <b>나스 폴더</b>에 넣습니다. (파일 탐색기 주소창에 \\192.168.1.2 를 입력하면 나스 폴더가 열립니다)</li>
          <li>나스 폴더에 넣은 파일을 <b>두 번 클릭</b>합니다. 바로 한 번 백업하고, 그 뒤로는 매주 토요일 낮 12시에 그 폴더로 자동 백업합니다.</li>
        </ol>
        <p className="muted small">백업 파일에는 심방보고를 포함한 모든 기록이 들어 있습니다. 나스 폴더는 관리자만 열 수 있게 해 주세요.  백업 파일은 지우지 않고 모두 보관합니다. 비밀번호는 백업되지 않습니다.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={download}>백업 프로그램 받기</button>
          <button type="button" className="btn" disabled={busy} onClick={rotate}>열쇠 바꾸기</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
