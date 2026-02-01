import { createHashRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import HomePage from '@/pages/HomePage'
import UsersPage from '@/pages/settings/UsersPage'
import DownloadPage from '@/pages/settings/DownloadPage'
import TaskDetailPage from '@/pages/settings/TaskDetailPage'
import AnalysisPage from '@/pages/settings/AnalysisPage'
import SystemPage from '@/pages/settings/SystemPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'users',
        element: <UsersPage />
      },
      {
        path: 'download',
        element: <DownloadPage />
      },
      {
        path: 'download/:id',
        element: <TaskDetailPage />
      },
      {
        path: 'analysis',
        element: <AnalysisPage />
      },
      {
        path: 'settings',
        element: <SystemPage />
      }
    ]
  },
  {
    path: '/settings/*',
    element: <Navigate to="/" replace />
  }
])
