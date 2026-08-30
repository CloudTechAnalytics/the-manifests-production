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

// Main tenant workspace (3rd batch, the big one) — everything that used
// to live under the invisible Next route group app/(app)/.
import AppLayout from '@/pages/app/layout';
import DashboardPage from '@/pages/app/dashboard/page';
import CalendarPage from '@/pages/app/calendar/page';
import ActivityLogPage from '@/pages/app/activity-log/page';
import ApprovalsPage from '@/pages/app/approvals/page';
import WorkQueuePage from '@/pages/app/work-queue/page';
import RatesPage from '@/pages/app/rates/page';
import ReportsPage from '@/pages/app/reports/page';
import SalesPage from '@/pages/app/sales/page';
import TrackingPage from '@/pages/app/tracking/page';
import CustomersPage from '@/pages/app/customers/page';
import NewCustomerPage from '@/pages/app/customers/new/page';
import CustomerDetailPage from '@/pages/app/customers/[id]/page';
import EditCustomerPage from '@/pages/app/customers/[id]/edit/page';
import ExpensesPage from '@/pages/app/expenses/page';
import NewExpensePage from '@/pages/app/expenses/new/page';
import ExpenseDetailPage from '@/pages/app/expenses/[id]/page';
import EditExpensePage from '@/pages/app/expenses/[id]/edit/page';
import InvoicesPage from '@/pages/app/invoices/page';
import NewInvoicePage from '@/pages/app/invoices/new/page';
import InvoiceDetailPage from '@/pages/app/invoices/[id]/page';
import EditInvoicePage from '@/pages/app/invoices/[id]/edit/page';
import PaymentsPage from '@/pages/app/payments/page';
import NewPaymentPage from '@/pages/app/payments/new/page';
import PaymentDetailPage from '@/pages/app/payments/[id]/page';
import QuotationsPage from '@/pages/app/quotations/page';
import NewQuotationPage from '@/pages/app/quotations/new/page';
import QuotationDetailPage from '@/pages/app/quotations/[id]/page';
import EditQuotationPage from '@/pages/app/quotations/[id]/edit/page';
import PlanningPage from '@/pages/app/planning/page';
import PlanningDetailPage from '@/pages/app/planning/[id]/page';
import ShipmentsPage from '@/pages/app/shipments/page';
import NewShipmentPage from '@/pages/app/shipments/new/page';
import ShipmentDetailPage from '@/pages/app/shipments/[id]/page';
import EditShipmentPage from '@/pages/app/shipments/[id]/edit/page';
import CustomsPage from '@/pages/app/customs/page';
import ExaminationPage from '@/pages/app/examination/page';
import TerminalPage from '@/pages/app/terminal/page';
import TransportationPage from '@/pages/app/transportation/page';
import WarehousePage from '@/pages/app/warehouse/page';
import WarehouseLocationsPage from '@/pages/app/warehouse/locations/page';
import NewWarehouseItemPage from '@/pages/app/warehouse/items/new/page';
import WarehouseItemDetailPage from '@/pages/app/warehouse/items/[id]/page';
import EditWarehouseItemPage from '@/pages/app/warehouse/items/[id]/edit/page';
import DocumentsPage from '@/pages/app/documents/page';
import UsersPage from '@/pages/app/users/page';
import SettingsPage from '@/pages/app/settings/page';

// Standalone top-level routes — no shared shell, each is its own screen.
import RegisterPage from '@/pages/register/page';
import AcceptInvitePage from '@/pages/accept-invite/page';
import VerifyEmailPage from '@/pages/verify-email/page';
import TrackPage from '@/pages/track/page';
import TermsPage from '@/pages/terms/page';
import PrivacyPage from '@/pages/privacy/page';
import OnboardingPage from '@/pages/onboarding/page';
import ChangePasswordPage from '@/pages/change-password/page';
import UpgradePage from '@/pages/upgrade/page';
import BillingCallbackPage from '@/pages/billing/callback/page';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
    errorElement: <RouteError />,
  },
  // Fully public — matches the old middleware's PUBLIC_PATHS allowlist
  // exactly (everything else required a session).
  { path: '/register', element: <RegisterPage />, errorElement: <RouteError /> },
  { path: '/accept-invite', element: <AcceptInvitePage />, errorElement: <RouteError /> },
  { path: '/verify-email', element: <VerifyEmailPage />, errorElement: <RouteError /> },
  { path: '/track', element: <TrackPage />, errorElement: <RouteError /> },
  { path: '/terms', element: <TermsPage />, errorElement: <RouteError /> },
  { path: '/privacy', element: <PrivacyPage />, errorElement: <RouteError /> },
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
      // Standalone authenticated screens — no shared shell of their own,
      // just the auth gate the old middleware's PUBLIC_PATHS omission
      // implied for them.
      { path: '/onboarding', element: <OnboardingPage /> },
      { path: '/change-password', element: <ChangePasswordPage /> },
      { path: '/upgrade', element: <UpgradePage /> },
      { path: '/billing/callback', element: <BillingCallbackPage /> },
      {
        element: <AppLayout />,
        errorElement: <RouteError fullHeight={false} homeHref="/dashboard" homeLabel="Go to dashboard" />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/activity-log', element: <ActivityLogPage /> },
          { path: '/approvals', element: <ApprovalsPage /> },
          { path: '/work-queue', element: <WorkQueuePage /> },
          { path: '/rates', element: <RatesPage /> },
          { path: '/reports', element: <ReportsPage /> },
          { path: '/sales', element: <SalesPage /> },
          { path: '/tracking', element: <TrackingPage /> },
          { path: '/customers', element: <CustomersPage /> },
          { path: '/customers/new', element: <NewCustomerPage /> },
          { path: '/customers/:id', element: <CustomerDetailPage /> },
          { path: '/customers/:id/edit', element: <EditCustomerPage /> },
          { path: '/expenses', element: <ExpensesPage /> },
          { path: '/expenses/new', element: <NewExpensePage /> },
          { path: '/expenses/:id', element: <ExpenseDetailPage /> },
          { path: '/expenses/:id/edit', element: <EditExpensePage /> },
          { path: '/invoices', element: <InvoicesPage /> },
          { path: '/invoices/new', element: <NewInvoicePage /> },
          { path: '/invoices/:id', element: <InvoiceDetailPage /> },
          { path: '/invoices/:id/edit', element: <EditInvoicePage /> },
          { path: '/payments', element: <PaymentsPage /> },
          { path: '/payments/new', element: <NewPaymentPage /> },
          { path: '/payments/:id', element: <PaymentDetailPage /> },
          { path: '/quotations', element: <QuotationsPage /> },
          { path: '/quotations/new', element: <NewQuotationPage /> },
          { path: '/quotations/:id', element: <QuotationDetailPage /> },
          { path: '/quotations/:id/edit', element: <EditQuotationPage /> },
          { path: '/planning', element: <PlanningPage /> },
          { path: '/planning/:id', element: <PlanningDetailPage /> },
          { path: '/shipments', element: <ShipmentsPage /> },
          { path: '/shipments/new', element: <NewShipmentPage /> },
          { path: '/shipments/:id', element: <ShipmentDetailPage /> },
          { path: '/shipments/:id/edit', element: <EditShipmentPage /> },
          { path: '/customs', element: <CustomsPage /> },
          { path: '/examination', element: <ExaminationPage /> },
          { path: '/terminal', element: <TerminalPage /> },
          { path: '/transportation', element: <TransportationPage /> },
          { path: '/warehouse', element: <WarehousePage /> },
          { path: '/warehouse/locations', element: <WarehouseLocationsPage /> },
          { path: '/warehouse/items/new', element: <NewWarehouseItemPage /> },
          { path: '/warehouse/items/:id', element: <WarehouseItemDetailPage /> },
          { path: '/warehouse/items/:id/edit', element: <EditWarehouseItemPage /> },
          { path: '/documents', element: <DocumentsPage /> },
          { path: '/users', element: <UsersPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
