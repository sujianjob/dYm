import { createHashRouter, Navigate } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import SettingsLayout from '@/pages/settings/SettingsLayout'
import UsersPage from '@/pages/settings/UsersPage'
import DownloadPage from '@/pages/settings/DownloadPage'
import TaskDetailPage from '@/pages/settings/TaskDetailPage'
import AnalysisPage from '@/pages/settings/AnalysisPage'
import SystemPage from '@/pages/settings/SystemPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <HomePage />
  },
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/settings/users" replace />
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
        path: 'system',
        element: <SystemPage />
      }
    ]
  }
])
