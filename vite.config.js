import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// base './' 로 두면 깃허브 페이지의 하위 주소에서도 그대로 열린다
// __BUILD__: 배포한 시각 (화면 점검 정보에서 새 버전이 깔렸는지 볼 때)
export default defineConfig({ base: './', plugins: [react()], define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) } })
