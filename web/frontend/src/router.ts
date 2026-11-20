import { createRouter, createWebHistory } from 'vue-router'

import HomeView from './views/HomeView.vue'
import TableView from './views/TableView.vue'
import DetailView from './views/DetailView.vue'
import RawRunsView from './views/RawRunsView.vue'
import RawRunView from './views/RawRunView.vue'
import RawResponseView from './views/RawResponseView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/t/:table', name: 'table', component: TableView },
    { path: '/t/:table/:pk', name: 'detail', component: DetailView },
    { path: '/raw', name: 'raw-runs', component: RawRunsView },
    { path: '/raw/runs/:id', name: 'raw-run', component: RawRunView },
    { path: '/raw/responses/:id', name: 'raw-response', component: RawResponseView },
  ],
})
