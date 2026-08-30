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

// Platform Console (2nd batch) — CloudTech's internal admin console.
import PlatformLayout from '@/pages/platform/layout';
import PlatformDashboardPage from '@/pages/platform/page';
import OrganizationsPage from '@/pages/platform/organizations/page';
import OrganizationDetailPage from '@/pages/platform/organizations/[id]/page';
import OrganizationsTrashPage from '@/pages/platform/organizations/trash/page';
import OrganizationUsersPage from '@/pages/platform/organization-users/page';
import PlatformUsersPage from '@/pages/platform/platform-users/page';
import SubscriptionsPage from '@/pages/platform/subscriptions/page';
import BillingPage from '@/pages/platform/billing/page';
import RevenueAnalyticsPage from '@/pages/platform/revenue-analytics/page';
import PlatformAnalyticsPage from '@/pages/platform/platform-analytics/page';
import AuditLogsPage from '@/pages/platform/audit-logs/page';
import SystemHealthPage from '@/pages/platform/system-health/page';
import SupportTicketsPage from '@/pages/platform/support-tickets/page';
import PlansPricingPage from '@/pages/platform/plans-pricing/page';
import PlatformSettingsPage from '@/pages/platform/settings/page';

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
      {
        path: '/platform',
        element: <PlatformLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <PlatformDashboardPage /> },
          { path: 'organizations', element: <OrganizationsPage /> },
          { path: 'organizations/trash', element: <OrganizationsTrashPage /> },
          { path: 'organizations/:id', element: <OrganizationDetailPage /> },
          { path: 'organization-users', element: <OrganizationUsersPage /> },
          { path: 'platform-users', element: <PlatformUsersPage /> },
          { path: 'subscriptions', element: <SubscriptionsPage /> },
          { path: 'billing', element: <BillingPage /> },
          { path: 'revenue-analytics', element: <RevenueAnalyticsPage /> },
          { path: 'platform-analytics', element: <PlatformAnalyticsPage /> },
          { path: 'audit-logs', element: <AuditLogsPage /> },
          { path: 'system-health', element: <SystemHealthPage /> },
          { path: 'support-tickets', element: <SupportTicketsPage /> },
          { path: 'plans-pricing', element: <PlansPricingPage /> },
          { path: 'settings', element: <PlatformSettingsPage /> },
        ],
      },
    ],
  },
]);
