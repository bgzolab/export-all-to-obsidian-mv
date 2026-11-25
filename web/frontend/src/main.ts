import { createApp } from 'vue'
import OpenVue from 'openvue/config'
import Aura from '@openvue/themes/aura'
import { definePreset } from '@openvue/themes'

import App from './App.vue'
import { router } from './router'
import './styles/main.css'

// Aura ships an emerald accent, which clashes with the indigo links and badges
// in the custom chrome. Pin the theme to the indigo ramp so buttons, focus
// rings, paginators and links share one accent.
const AppTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
  },
})

createApp(App)
  .use(router)
  .use(OpenVue, { theme: { preset: AppTheme } })
  .mount('#app')
