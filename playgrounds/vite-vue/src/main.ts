import { createApp } from 'vue'
import './style.css'
import '@gp-grid/vue/dist/styles.css'
import App from './App.vue'
import ConformanceApp from './ConformanceApp.vue'

const AppRoot = new URLSearchParams(window.location.search).has('conformance') ? ConformanceApp : App
createApp(AppRoot).mount('#app')
