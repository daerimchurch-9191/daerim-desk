import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// base './' 로 두면 깃허브 페이지의 하위 주소에서도 그대로 열린다
export default defineConfig({ base: './', plugins: [react()] })
