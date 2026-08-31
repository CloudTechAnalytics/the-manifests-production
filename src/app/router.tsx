import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth, RedirectIfAuthenticated } from './route-guards';
import { RouteError } from '@/shared/components/route-error';

// Every page is grouped by feature folder (Phase 2 of the migration
// plan — src/features/<domain>/{pages,components}, cross-feature
// infrastructure in src/shared/), matching the reference's structure.
// Route paths are unchanged from Phase 1 — this reorg only moved files
// and updated import paths, no URL or behavior changed.
import Home from '@/features/landing/pages/page';
import LoginPage from '@/features/auth/pages/login/page';
import RegisterPage from '@/features/auth/pages/register/page';
import AcceptInvitePage from '@/features/auth/pages/accept-invite/page';
import VerifyEmailPage from '@/features/auth/pages/verify-email/page';
import ChangePasswordPage from '@/features/auth/pages/change-password/page';

import TrackPage from '@/features/tracking/pages/track/page';
import TrackingPage from '@/features/tracking/pages/tracking/page';

import TermsPage from '@/features/legal/pages/terms/page';
import PrivacyPage from '@/features/legal/pages/privacy/page';

import OnboardingPage from '@/features/onboarding/pages/onboarding/page';
import UpgradePage from '@/features/billing/pages/upgrade/page';
import BillingCallbackPage from '@/features/billing/pages/billing/callback/page';

import HrLayout from '@/features/hr/pages/layout';
import HrDashboardPage from '@/features/hr/pages/dashboard/page';
import EmployeesPage from '@/features/hr/pages/employees/page';
import NewEmployeePage from '@/features/hr/pages/employees/new/page';
import EmployeeDetailPage from '@/features/hr/pages/employees/[id]/page';
import EditEmployeePage from '@/features/hr/pages/employees/[id]/edit/page';
import PeopleCapacityPage from '@/features/hr/pages/capacity/page';
import DepartmentCapacityPage from '@/features/hr/pages/capacity/departments/page';
import BranchCapacityPage from '@/features/hr/pages/capacity/branches/page';
import TrainingCatalogPage from '@/features/hr/pages/training/page';
import MyLearningPage from '@/features/hr/pages/training/my/page';
import NewCoursePage from '@/features/hr/pages/training/courses/new/page';
import CourseDetailPage from '@/features/hr/pages/training/courses/[id]/page';
import EditCoursePage from '@/features/hr/pages/training/courses/[id]/edit/page';

// Platform Console — CloudTech's internal admin console.
import PlatformLayout from '@/features/platform/pages/layout';
import PlatformDashboardPage from '@/features/platform/pages/page';
import OrganizationsPage from '@/features/platform/pages/organizations/page';
import OrganizationDetailPage from '@/features/platform/pages/organizations/[id]/page';
import OrganizationUsersPage from '@/features/platform/pages/organization-users/page';
import PlatformUsersPage from '@/features/platform/pages/platform-users/page';
import SubscriptionsPage from '@/features/platform/pages/subscriptions/page';
import PlatformBillingPage from '@/features/platform/pages/billing/page';
import RevenueAnalyticsPage from '@/features/platform/pages/revenue-analytics/page';
import PlatformAnalyticsPage from '@/features/platform/pages/platform-analytics/page';
import AuditLogsPage from '@/features/platform/pages/audit-logs/page';
import SystemHealthPage from '@/features/platform/pages/system-health/page';
import SupportTicketsPage from '@/features/platform/pages/support-tickets/page';
import PlansPricingPage from '@/features/platform/pages/plans-pricing/page';
import PlatformSettingsPage from '@/features/platform/pages/settings/page';

// Main tenant workspace — everything under the shared AppLayout shell.
import AppLayout from '@/shared/components/layout/app-layout';
import DashboardPage from '@/features/dashboard/pages/dashboard/page';
import CalendarPage from '@/features/calendar/pages/calendar/page';
import ActivityLogPage from '@/features/activity-log/pages/activity-log/page';
import ApprovalsPage from '@/features/approvals/pages/approvals/page';
import WorkQueuePage from '@/features/work-queue/pages/work-queue/page';
import RatesPage from '@/features/rates/pages/rates/page';
import ReportsPage from '@/features/reports/pages/reports/page';
import SalesPage from '@/features/sales/pages/sales/page';
import CustomersPage from '@/features/customers/pages/customers/page';
import NewCustomerPage from '@/features/customers/pages/customers/new/page';
import CustomerDetailPage from '@/features/customers/pages/customers/[id]/page';
import EditCustomerPage from '@/features/customers/pages/customers/[id]/edit/page';
import ExpensesPage from '@/features/expenses/pages/expenses/page';
import NewExpensePage from '@/features/expenses/pages/expenses/new/page';
import ExpenseDetailPage from '@/features/expenses/pages/expenses/[id]/page';
import EditExpensePage from '@/features/expenses/pages/expenses/[id]/edit/page';
import InvoicesPage from '@/features/invoices/pages/invoices/page';
import NewInvoicePage from '@/features/invoices/pages/invoices/new/page';
import InvoiceDetailPage from '@/features/invoices/pages/invoices/[id]/page';
import EditInvoicePage from '@/features/invoices/pages/invoices/[id]/edit/page';
import PaymentsPage from '@/features/payments/pages/payments/page';
import NewPaymentPage from '@/features/payments/pages/payments/new/page';
import PaymentDetailPage from '@/features/payments/pages/payments/[id]/page';
import QuotationsPage from '@/features/quotations/pages/quotations/page';
import NewQuotationPage from '@/features/quotations/pages/quotations/new/page';
import QuotationDetailPage from '@/features/quotations/pages/quotations/[id]/page';
import EditQuotationPage from '@/features/quotations/pages/quotations/[id]/edit/page';
import PlanningPage from '@/features/planning/pages/planning/page';
import PlanningDetailPage from '@/features/planning/pages/planning/[id]/page';
import ShipmentsPage from '@/features/shipments/pages/shipments/page';
import NewShipmentPage from '@/features/shipments/pages/shipments/new/page';
import ShipmentDetailPage from '@/features/shipments/pages/shipments/[id]/page';
import EditShipmentPage from '@/features/shipments/pages/shipments/[id]/edit/page';
import CustomsPage from '@/features/customs/pages/customs/page';
import ExaminationPage from '@/features/examination/pages/examination/page';
import TerminalPage from '@/features/terminal/pages/terminal/page';
import TransportationPage from '@/features/transportation/pages/transportation/page';
import WarehousePage from '@/features/warehouse/pages/warehouse/page';
import WarehouseLocationsPage from '@/features/warehouse/pages/warehouse/locations/page';
import NewWarehouseItemPage from '@/features/warehouse/pages/warehouse/items/new/page';
import WarehouseItemDetailPage from '@/features/warehouse/pages/warehouse/items/[id]/page';
import EditWarehouseItemPage from '@/features/warehouse/pages/warehouse/items/[id]/edit/page';
import DocumentsPage from '@/features/documents/pages/documents/page';
import UsersPage from '@/features/administration/pages/users/page';
import SettingsPage from '@/features/administration/pages/settings/page';

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
          { path: 'organizations/:id', element: <OrganizationDetailPage /> },
          { path: 'organization-users', element: <OrganizationUsersPage /> },
          { path: 'platform-users', element: <PlatformUsersPage /> },
          { path: 'subscriptions', element: <SubscriptionsPage /> },
          { path: 'billing', element: <PlatformBillingPage /> },
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
