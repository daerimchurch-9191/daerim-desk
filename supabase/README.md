# 데이터베이스 구조

Supabase 프로젝트 `pvxhzpuoijazqsgjgmne` 에 적용된 표와 권한 규칙.

| 표 | 내용 | 볼 수 있는 사람 | 고칠 수 있는 사람 |
|---|---|---|---|
| profiles | 사역자 (가입 시 승인 대기로 생성) | 승인된 사역자 | 본인(이름 등), 관리자(역할·승인) |
| departments | 부서 11개. grp 로 교회 전체·교육부(유아·유치·유년·초등·청소년·청년부)·교구(1~4교구) 묶음 | 누구나 (가입 화면에서 사용) | 관리자 |
| events | 교회 공용 일정 | 승인된 사역자 | 등록한 사람, 관리자 |
| sermons | 예배 설교표(공개)와 직접 추가한 내 설교(비공개). 새벽·수요·금요는 날짜마다 한 칸 | 공개는 모두, 비공개는 본인 | 공개는 모두, 비공개는 본인 |
| vehicles | 차량 | 승인된 사역자 | 관리자 |
| vehicle_bookings | 차량 예약 (같은 차량 시간 겹침은 거부) | 승인된 사역자 | 신청한 사람, 관리자 |
| todos | 내 할 일 (repeat_dow 만 있으면 매주, repeat_week 까지 있으면 매월 n째·마지막 주 반복) | 본인만 | 본인만 |
| profile_depts | 사역자 ↔ 부서 (여러 개, 기본키 profile_id+dept_id) | 승인된 사역자 | 관리자(set_member_depts), 가입 처리 |
| notices | 공지 (audience: all·parish·edu, until 지나면 화면에서 숨김) | 전체 공지는 모두, 교구·교육부 공지는 그 소속(profile_depts → departments.grp, 여러 부서 중 하나라도)과 관리자 | 관리자 |
| notice_reads | 읽은 공지 (새 글 개수용) | 본인만 | 본인만 |

승인 대기(pending) 상태인 사람은 자기 정보 외에는 아무것도 볼 수 없다.
사용 중지(inactive) 상태도 마찬가지다. 교회를 떠난 사역자는 관리자가 회원 관리에서 사용 중지하며, 계정과 그분이 남긴 기록은 지우지 않는다.

## 서버 함수

| 함수 | 하는 일 | 누가 |
|---|---|---|
| reset-password | 다른 사역자의 비밀번호를 새로 정함 (`functions/reset-password`) | 승인된 관리자만. 함수 안에서 확인함 |

## 휴대폰 알림 (웹 푸시)

- `push_subscriptions`: 알림을 켠 기기 목록. 본인 기기만 보고 지울 수 있다. 등록은 `notify-notice` 함수가 대신 한다.
- `notify-notice` 함수: 새 공지 알림 보내기(관리자만), 시험 알림(본인 기기만), 기기 등록.
- 푸시 비밀 키는 데이터베이스 금고(vault)의 `vapid_private_key`에 있다. `get_vapid_private_key()`는 service_role만 부를 수 있다. 공개 키는 `src/push.js`와 함수 코드에 있다.
- 아이폰은 사파리에서 "홈 화면에 추가"로 설치한 앱에서만 알림을 받는다 (iOS 16.4 이상).

## 권한 (profiles.perms)

- 관리자(`role = 'admin'`): 회원 관리·권한 관리. 공지·광고 권한을 모두 포함한다. 차량 목록 넣고 빼기도 관리자만 한다. 심방방은 포함하지 않는다.
- `perms` 배열: `notice`(공지 작성) `event_all`(교회 전체 일정 등록·수정·삭제) `visit_all`(모든 교구 심방방) `visit:<교구 부서 id>`(그 교구 심방방).
- `has_perm(이름)`이 데이터베이스 규칙에서 확인한다. 권한·부서는 관리자만 바꿀 수 있다 (guard_profile). 이름·직분·부서는 회원 관리의 "정보 수정". 화면은 "권한 관리"(#perms).

## 심방방 (visit_messages)

- 교구마다 방이 하나씩 있는 채팅. `dept_id`는 교구 부서 id.
- 그 교구 권한이나 `visit_all`이 있어야 보고 쓸 수 있다. 고치기·지우기는 자기 글만. 사용 중지된 계정은 바로 못 본다.
- 주민번호·연락처·주소는 적지 않는다 (디모데에서 확인). 예전 visit_reports 표는 이 방으로 옮기고 지웠다.

## 주보 광고 (bulletin_ads)

- `week_of`는 그 주 주일 날짜. 승인된 사역자 누구나 보고 올린다. 고치기·지우기도 승인된 사역자 누구나.

## 자동 백업 (backup-export)

- 관리자 메뉴 → 기타 → "자동 백업"에서 관리자가 `대시보드백업.bat`을 받는다. 백업 열쇠가 파일 안에 들어간다 (깃허브·채팅에는 없음).
- 이 파일을 나스 폴더에 넣고 교회 컴퓨터에서 두 번 클릭하면 바로 한 번 백업하고, 윈도우 작업 스케줄러에 매주 토요일 12:00 백업을 등록한다. 결과는 같은 폴더의 backup-log.txt.
- 백업 = 모든 표 + 로그인 계정 목록(비밀번호 제외)을 JSON 한 파일로. 백업 파일은 지우지 않고 모두 보관한다. 실행할 때마다 `backup_runs`에 기록 → 관리자 화면에 "마지막 백업" 표시.
- 열쇠는 금고(vault)의 `backup_token`. `get_backup_token()`·`rotate_backup_token()`은 관리자만. 열쇠를 바꾸면 예전 .bat은 작동하지 않는다.
- 함수는 로그인 없이 열쇠로만 확인한다 (verify_jwt 끔).

## 새벽 담당표 구글 시트 연동 (dawn-sheet-sync)

- 시트 "새벽 기도 담당표"(달 탭마다 "○○년 ○월" 제목, 주일~토 칸, 한 주 = 날짜/본문/담당자 3줄) 안에 Apps Script를 넣어 쓴다. 코드는 관리자 메뉴 → 기타 → "연동 코드 복사" (열쇠 포함, `src/sheetsync.jsx`).
- 스크립트가 시트 수정 때마다 + 10분마다 시트 전체를 보낸다. 함수는 `sheet_sync_state`(마지막으로 맞춘 값)와 비교해 시트가 바뀐 날은 대시보드(sermons, service='dawn')에, 대시보드만 바뀐 날은 시트에 써 넣을 값을 돌려준다. 양쪽이 같은 날을 동시에 바꾸면 시트가 이긴다.
- 담당자 이름이 승인된 사역자 이름과 같으면 preacher_id로, 아니면(예: "담임목사") preacher_name 글자로 저장한다.
- 열쇠는 금고의 `sheet_token`, `get_sheet_token()`은 관리자만. 실행 기록은 `sheet_sync_runs`(14일 보관).


## 노션 차량신청 연동 (notion-car-sync)

- 노션 데이터베이스 `34bbedb1067680d49fc6e266d8de6dcd` (속성: 신청자명·차량종류·날짜 및 시간·운전자명·신청 부서 및 사유) ↔ `vehicle_bookings`.
- 호출: pg_cron `notion-car-sync`(5분마다) + 트리거 `vehicle_bookings_kick_notion`(대시보드에서 바뀔 때, service_role 변경은 제외). 둘 다 `x-sync-token` = 금고 `notion_sync_token`.
- 노션 토큰: 서버 함수 비밀 값 `NOTION_TOKEN`.
- 열: `vehicles.notion_name`, `vehicle_bookings.notion_page_id / notion_edited_at / notion_synced_at / updated_at`.
- 표: `notion_booking_deletions`(대시보드에서 지운 예약 → 노션에서 보관), `notion_sync_meta`(자물쇠·마지막 실행·오류, 관리자 조회), `notion_sync_issues`(못 가져온 신청, 관리자 조회·삭제).
- 규칙: 어제 이후 일정만. 노션만 바뀜 → 대시보드, 대시보드만 바뀜 → 노션, 둘 다 → 노션. 노션 신청 하나에 차량 여러 대 → 차량마다 예약 하나(같은 page id). 날짜만 있으면 하루 종일, 끝 시간이 없으면 1시간.
- 연동 전 예약 백업: `vehicle_bookings_backup_20261114` (확인 후 지워도 됨).
- 한계: 노션 수정 시각이 분 단위라 같은 분 안에 양쪽에서 고치면 하나가 늦게 반영될 수 있다.

## 설교표 구글 캘린더 연동 (calendar-sermon-sync)

- 캘린더 "대림교회 배우는 숲"(교회 구글 계정). Apps Script 코드는 관리자 메뉴 → 기타에서 열쇠(금고 `calendar_token`, `get_calendar_token()`)와 함께 복사한다.
- 스크립트가 60일 전 ~ 1년 뒤 일정 중 제목이 "종류 : 설교자"인 것을 보낸다. 종류: 새벽→dawn, 수요→wed, 금요→fri. 그 밖의 일정(종일 포함)은 `church`로 보내 `events`(dept_id 'all')와 맞춘다(상태 표 `calendar_event_state`). 대시보드 → 캘린더는 dept_id 'all' 일정만, 부서로 바꾸면 캘린더에서 뺀다. 반복 일정은 캘린더에서 지우지 않는다.
- 표: `calendar_sync_state`(일정 키 ↔ 설교 id, 마지막으로 맞춘 값), `calendar_sync_runs`(실행 기록·문제, 14일 보관). 둘 다 관리자만 조회.
- 규칙: 캘린더만 바뀜 → 대시보드, 대시보드만 바뀜 → 캘린더(제목·시간, 본문은 설명란에), 둘 다 → 캘린더. 캘린더에서 지움 → 설교 지움(본문이 있으면 설교자만 비움). 대시보드에서 지움 → 일정 지움(반복 일정은 이름만 비움). 대시보드에만 있는 오늘 이후 공개 설교 → 일정 생성(태그 `daerim_sermon`).
- 이름 비교는 띄어쓰기와 뒤 직분을 무시한다. "새벽 : 목사"처럼 직분만 있으면 빈칸으로 본다.

## 일정 (events) 권한 정리

- 조회: 승인된 사역자. 단 `dept_id = 'personal'`(개인 일정)은 등록한 사람만.
- 교회 전체(`all`) 일정은 관리자 또는 `event_all` 권한만 등록·수정·삭제. 권한자는 남이 올린(구글 캘린더에서 온) 교회 전체 일정도 고칠 수 있다.
- 그 밖의 부서 일정은 등록한 사람과 관리자.

## 연차 (leave_balances, leave_requests)

- `leave_balances(profile_id, year, days)`: 해마다 부여 일수. 본인과 연차 관리자(`is_leave_admin()` = 관리자 또는 `leave_admin`)만 조회, 연차 관리자만 쓰기.
- `leave_requests`: 신청(part: full/am/pm, days, status: pending/approved/rejected/cancelled, event_id). 본인과 연차 관리자만 조회, 본인만 신청(대기 상태로만).
- `decide_leave(req, approve, note)`: 연차 관리자. 승인이면 신청자 개인 일정(events, dept 'personal', created_by=신청자)을 만들고 event_id에 적는다. 상태 바꾸기와 일정 만들기가 한 번에.
- `cancel_leave(req)`: 본인은 대기 중만, 연차 관리자는 승인된 것도. 개인 일정도 지운다.

## 알림 (notification_prefs, notify-event)

- `notification_prefs`: 본인만 읽고 쓴다. 칸: notice, visit, ads, cars, leave, cal_all, cal_mine, cal_edu, cal_parish.
- 트리거 `kick_notify`: visit_messages·bulletin_ads·vehicle_bookings·events 새 줄, leave_requests 새 줄과 승인/반려 → `notify-event` (pg_net, 열쇠 `notify_token`은 금고, `get_notify_token`은 service_role만).
- `notify-notice`(공지)도 notice를 끈 사람은 뺀다.
