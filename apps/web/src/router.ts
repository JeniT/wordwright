import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
  { path: '/', name: 'drafts', component: () => import('./views/DraftsView.vue') },
  {
    path: '/drafts/:id',
    name: 'draft',
    component: () => import('./views/EditorView.vue'),
    props: true,
  },
]

export const router = createRouter({ history: createWebHistory(), routes })
