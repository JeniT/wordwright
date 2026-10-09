import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router'
import './style.css'

createApp(App).use(createPinia()).use(VueQueryPlugin).use(createAppRouter()).mount('#app')
