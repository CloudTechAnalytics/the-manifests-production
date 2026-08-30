import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth, RedirectIfAuthenticated } from './route-guards';
import { RouteError } from '@/components/route-error';

// Pilot batch (Phase 1 of the migration plan): landing + login + the
// full HR Workspace route group, converted and wired end-to-end to
// prove the whole mechanism — Vite build, React Router nesting, auth
// guards, layouts-as-<Outlet/> — before the remaining ~70 pages
// (platform/, the main (app) group, the standalone top-level routes)
// get batched through the same process. Only pages actually converted
// get imported here; everything else still under src/pages is
// unconverted and deliberately not wired in yet, so it can't break
// this build.
import Home from '@/pages/page';
import LoginPage from '@/pages/login/page';

import HrLayout from '@/pages/hr/layout';
import HrDashboardPage from '@/pages/hr/dashboard/page';
import EmployeesPage from '@/pages/hr/employees/page';
import NewEmployeePage from '@/pages/hr/employees/new/page';
import EmployeeDetailPage from '@/pages/hr/employees/[id]/page';
import EditEmployeePage from '@/pages/hr/employees/[id]/edit/page';
import PeopleCapacityPage from '@/pages/hr/capacity/page';
import DepartmentCapacityPage from '@/pages/hr/capacity/departments/page';
import BranchCapacityPage from '@/pages/hr/capacity/branches/page';
import TrainingCatalogPage from '@/pages/hr/training/page';
import MyLearningPage from '@/pages/hr/training/my/page';
import NewCoursePage from '@/pages/hr/training/courses/new/page';
import CourseDetailPage from '@/pages/hr/training/courses/[id]/page';
import EditCoursePage from '@/pages/hr/training/courses/[id]/edit/page';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
    errorElement: <RouteError />,
  },
  {
    element: <RedirectIfAuthenticated />,
    errorElement: <RouteError />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/hr',
        element: <HrLayout />,
        errorElement: <RouteError fullHeight={false} homeHref="/dashboard" homeLabel="Go to dashboard" />,
        children: [
          { path: 'dashboard', element: <HrDashboardPage /> },
          { path: 'employees', element: <EmployeesPage /> },
          { path: 'employees/new', element: <NewEmployeePage /> },
          { path: 'employees/:id', element: <EmployeeDetailPage /> },
          { path: 'employees/:id/edit', element: <EditEmployeePage /> },
          { path: 'capacity', element: <PeopleCapacityPage /> },
          { path: 'capacity/departments', element: <DepartmentCapacityPage /> },
          { path: 'capacity/branches', element: <BranchCapacityPage /> },
          { path: 'training', element: <TrainingCatalogPage /> },
          { path: 'training/my', element: <MyLearningPage /> },
          { path: 'training/courses/new', element: <NewCoursePage /> },
          { path: 'training/courses/:id', element: <CourseDetailPage /> },
          { path: 'training/courses/:id/edit', element: <EditCoursePage /> },
        ],
      },
    ],
  },
]);
