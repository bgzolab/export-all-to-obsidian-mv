import { createApp } from 'vue'
import OpenVue from 'openvue/config'
import Aura from '@openvue/themes/aura'

import App from './App.vue'
import { router } from './router'
import './styles/main.css'

createApp(App)
  .use(router)
  .use(OpenVue, { theme: { preset: Aura } })
  .mount('#app')
