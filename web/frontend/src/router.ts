import { createRouter, createWebHistory } from 'vue-router'

import HomeView from './views/HomeView.vue'
import TableView from './views/TableView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/t/:table', name: 'table', component: TableView },
  ],
})
