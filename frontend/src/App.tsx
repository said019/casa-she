import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import UpdatePrompt from "@/components/UpdatePrompt";

// Public pages
import Index from "./pages/Index";
import CasaSheLanding from "./pages/CasaSheLanding";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import CancellationPolicy from "./pages/CancellationPolicy";
import MapsExport from "./pages/MapsExport";

// Auth pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

// Instructor auth pages
import InstructorAccess from "./pages/instructor/InstructorAccess";
import InstructorMagicLogin from "./pages/instructor/InstructorMagicLogin";

// Client pages
import ClientDashboard from "./pages/client/Dashboard";
import BookClasses from "./pages/client/BookClasses";
import BookClassConfirm from "./pages/client/BookClassConfirm";
import MyBookings from "./pages/client/MyBookings";
import ClassBookingDetail from "./pages/client/ClassBookingDetail";
import WalletClub from "./pages/client/Wallet";
import WalletRewards from "./pages/client/WalletRewards";
import WalletHistory from "./pages/client/WalletHistory";
import ClientProfile from "./pages/client/Profile";
import ProfileEdit from "./pages/client/ProfileEdit";
import ProfileMembership from "./pages/client/ProfileMembership";
import ProfilePreferences from "./pages/client/ProfilePreferences";
import SelectReformer from "./pages/client/SelectReformer";
import Notifications from "./pages/client/Notifications";
import ClientCheckout from "./pages/client/Checkout";
import ClientOrders from "./pages/client/Orders";
import ClientOrderDetail from "./pages/client/OrderDetail";
import VideoLibrary from "./pages/client/VideoLibrary";
import VideoPlayer from "./pages/client/VideoPlayer";
import ClientEvents from "./pages/client/Events";
import Checkout from "./pages/Checkout";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import PlansList from "./pages/admin/plans/PlansList";
import ClientsList from "./pages/admin/clients/ClientsList";
import ClientDetail from "./pages/admin/clients/ClientDetail";
import PendingMemberships from "./pages/admin/memberships/PendingMemberships";
import MembershipsActive from "./pages/admin/memberships/MembershipsActive";
import MembershipsExpiring from "./pages/admin/memberships/MembershipsExpiring";
import MembershipsAll from "./pages/admin/memberships/MembershipsAll";
import InstructorsList from "./pages/admin/staff/InstructorsList";
import ClassTypesList from "./pages/admin/classes/ClassTypesList";
import WeeklySchedule from "./pages/admin/schedules/WeeklySchedule";
import ClassesCalendar from "./pages/admin/classes/ClassesCalendar";
import GenerateClasses from "./pages/admin/classes/GenerateClasses";
import WorkoutTemplates from "./pages/admin/classes/WorkoutTemplates";
import AdminBookingsScreen from "./pages/admin/bookings/AdminBookingsScreen";
import Waitlist from "./pages/admin/bookings/Waitlist";
import MemberNew from "./pages/admin/members/MemberNew";
import AssignMembership from "./pages/admin/members/AssignMembership";
import PhysicalSale from "./pages/admin/members/PhysicalSale";
import PaymentsHub from "./pages/admin/payments/PaymentsHub";

// Migration pages - New complete system
import { ClientMigrationPage } from "./pages/admin/ClientMigrationPage";

// Settings pages
import GeneralSettings from "./pages/admin/settings/GeneralSettings";
import StudioSettings from "./pages/admin/settings/StudioSettings";
import PoliciesSettings from "./pages/admin/settings/PoliciesSettings";
import AdminCancellationPolicy from "./pages/admin/settings/CancellationPolicy";
import NotificationSettings from "./pages/admin/settings/NotificationSettings";
import ClosedDays from "./pages/admin/settings/ClosedDays";
import WhatsAppSettings from "./pages/admin/settings/WhatsAppSettings";

// Loyalty pages
import LoyaltyConfig from "./pages/admin/loyalty/LoyaltyConfig";
import LoyaltyRewards from "./pages/admin/loyalty/LoyaltyRewards";
import LoyaltyRedemptions from "./pages/admin/loyalty/LoyaltyRedemptions";
import LoyaltyAdjust from "./pages/admin/loyalty/LoyaltyAdjust";

// Reports pages
import ReportsOverview from "./pages/admin/reports/ReportsOverview";
import ReportsClasses from "./pages/admin/reports/ReportsClasses";
import ReportsRevenue from "./pages/admin/reports/ReportsRevenue";
import ReportsRetention from "./pages/admin/reports/ReportsRetention";
import ReportsInstructors from "./pages/admin/reports/ReportsInstructors";
import ReportsEgresos from "./pages/admin/reports/ReportsEgresos";
import ReportsTopClients from "./pages/admin/reports/ReportsTopClients";
import InstructorDetail from "./pages/admin/reports/InstructorDetail";

// Facilities page
import FacilitiesList from "./pages/admin/facilities/FacilitiesList";
import FacilityLayoutEditor from "./pages/admin/facilities/FacilityLayoutEditor";

// Orders/Payments verification page


// Admin Video Management
import AdminVideoList from "./pages/admin/videos/VideoList";
import AdminVideoUpload from "./pages/admin/videos/VideoUpload";
import VideoSalesVerification from "./pages/admin/videos/VideoSalesVerification";
import EventsManager from "./pages/admin/events/EventsManager";
import DiscountCodes from "./pages/admin/discount-codes/DiscountCodes";
import ProductsPage from "./pages/admin/pos/ProductsPage";
import POSPage from "./pages/admin/pos/POSPage";
import CashShiftsList from "./pages/admin/cash-shifts/CashShiftsList";
import CashShiftDetail from "./pages/admin/cash-shifts/CashShiftDetail";
import SalesByStaff from "./pages/admin/reports/SalesByStaff";
import MembershipMovements from "./pages/admin/reports/MembershipMovements";
import AuditLog from "./pages/admin/audit/AuditLog";
import CommissionsPage from "./pages/admin/commissions/CommissionsPage";
import CoachPayrollPage from "./pages/admin/payroll/CoachPayrollPage";
import ReceptionStaffList from "./pages/admin/reception/ReceptionStaffList";
import SubstitutionsAdmin from "./pages/admin/substitutions/SubstitutionsAdmin";

// Reception layout + pages
import { AuthGuard } from "./components/layout/AuthGuard";
import ReceptionLayout from "./components/layout/ReceptionLayout";
import CajaScreen from "./pages/reception/CajaScreen";
import PosScreen from "./pages/reception/PosScreen";
import CheckinScreen from "./pages/reception/CheckinScreen";
import ReceptionClientsScreen from "./pages/reception/ClientsScreen";
import ReceptionBookingsScreen from "./pages/reception/BookingsScreen";
import ReceptionBookingHistoryScreen from "./pages/reception/BookingHistoryScreen";
import ReceptionWaitlistScreen from "./pages/reception/WaitlistScreen";
import ReceptionDashboardScreen from "./pages/reception/DashboardScreen";
import ReceptionInventoryScreen from "./pages/reception/InventoryScreen";
import ReceptionPayrollScreen from "./pages/reception/PayrollScreen";
import ReceptionTeamScreen from "./pages/reception/TeamScreen";
import ReceptionApprovalsScreen from "./pages/reception/ApprovalsScreen";
import ReceptionWhatsAppScreen from "./pages/reception/WhatsAppScreen";
import ReceptionGenerateWeekScreen from "./pages/reception/GenerateWeekScreen";

// Coach pages
import CoachLogin from "./pages/auth/CoachLogin";
import CoachDashboard from "./pages/coach/Dashboard";
import CoachSchedule from "./pages/coach/Schedule";
import CoachClassDetail from "./pages/coach/ClassDetail";
import CoachProfile from "./pages/coach/Profile";
import CoachHistory from "./pages/coach/History";
import CoachSubstitutions from "./pages/coach/Substitutions";
import CoachPlaylists from "./pages/coach/Playlists";
import CoachTemplates from "./pages/coach/Templates";
import CoachEarnings from "./pages/coach/Earnings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

// Component to check auth on app load
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return <>{children}</>;
}

function LegacyClientBookRedirect() {
  const { classId } = useParams();
  return <Navigate to={classId ? `/app/book/${classId}` : "/app/book"} replace />;
}

/**
 * Cambia el manifest según la ruta: en el portal de coaches (/coach/*) apunta a
 * coach-manifest.json (start_url /coach) para que el acceso directo que guardan los
 * coaches abra SU portal y no el login de cliente. En el resto, el manifest normal.
 */
function ManifestSwitcher() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isCoach = pathname.startsWith("/coach");
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.setAttribute("href", isCoach ? "/coach-manifest.json" : "/manifest.json");
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute("content", isCoach ? "Casa Shé" : "Casa Shé");
  }, [pathname]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ManifestSwitcher />
        <AuthInitializer>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<CasaSheLanding />} />
            <Route path="/inicio-clasico" element={<Index />} />
            <Route path="/clases/:classId" element={<LegacyClientBookRedirect />} />
            <Route path="/coaches/:slug" element={<Navigate to="/#equipo" replace />} />
            <Route path="/pricing" element={<Checkout />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/cancellation-policy" element={<CancellationPolicy />} />
            <Route path="/maps-export" element={<MapsExport />} />

            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Instructor Auth Routes */}
            <Route path="/instructor/access" element={<InstructorAccess />} />
            <Route path="/instructor/magic-login" element={<InstructorMagicLogin />} />

            {/* Client Routes */}
            <Route path="/app" element={<ClientDashboard />} />
            <Route path="/app/book" element={<BookClasses />} />
            <Route path="/app/book/:classId" element={<BookClassConfirm />} />
            <Route path="/app/classes" element={<MyBookings />} />
            <Route path="/app/classes/:bookingId" element={<ClassBookingDetail />} />
            <Route path="/app/classes/:bookingId/spot" element={<SelectReformer />} />
            <Route path="/app/wallet" element={<WalletClub />} />
            <Route path="/app/wallet/rewards" element={<WalletRewards />} />
            <Route path="/app/wallet/history" element={<WalletHistory />} />
            <Route path="/app/profile" element={<ClientProfile />} />
            <Route path="/app/profile/edit" element={<ProfileEdit />} />
            <Route path="/app/profile/membership" element={<ProfileMembership />} />
            <Route path="/app/profile/preferences" element={<ProfilePreferences />} />
            <Route path="/app/notifications" element={<Notifications />} />
            <Route path="/app/checkout" element={<ClientCheckout />} />
            <Route path="/app/orders" element={<ClientOrders />} />
            <Route path="/app/orders/:orderId" element={<ClientOrderDetail />} />
            <Route path="/app/videos" element={<VideoLibrary />} />
            <Route path="/app/videos/:videoId" element={<VideoPlayer />} />
            <Route path="/app/events" element={<ClientEvents />} />

            {/* Admin Routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/events" element={<EventsManager />} />
            <Route path="/admin/discount-codes" element={<DiscountCodes />} />
            <Route path="/admin/calendar" element={<ClassesCalendar />} />

            <Route path="/admin/bookings" element={<AdminBookingsScreen />} />
            <Route path="/admin/bookings/waitlist" element={<Waitlist />} />

            <Route path="/admin/classes/schedules" element={<WeeklySchedule />} />
            <Route path="/admin/classes/types" element={<ClassTypesList />} />
            <Route path="/admin/classes/prices" element={<PlansList />} />
            <Route path="/admin/classes/generate" element={<GenerateClasses />} />
            <Route path="/admin/classes/templates" element={<WorkoutTemplates />} />

            <Route path="/admin/members" element={<ClientsList />} />
            <Route path="/admin/members/new" element={<MemberNew />} />
            <Route path="/admin/members/:userId/assign-membership" element={<AssignMembership />} />
            <Route path="/admin/members/:userId/physical-sale" element={<PhysicalSale />} />
            <Route path="/admin/members/:id" element={<ClientDetail />} />

            <Route path="/admin/memberships/pending" element={<PendingMemberships />} />
            <Route path="/admin/memberships/active" element={<MembershipsActive />} />
            <Route path="/admin/memberships/expiring" element={<MembershipsExpiring />} />
            <Route path="/admin/memberships/all" element={<MembershipsAll />} />
            <Route path="/admin/memberships/paquetes" element={<PlansList />} />
            <Route path="/admin/memberships" element={<Navigate to="/admin/memberships/all" replace />} />
            <Route path="/admin/instructors" element={<InstructorsList />} />
            <Route path="/admin/payments" element={<PaymentsHub />} />
            <Route path="/admin/payments/transactions" element={<Navigate to="/admin/payments" replace />} />
            <Route path="/admin/payments/pending" element={<Navigate to="/admin/payments" replace />} />
            <Route path="/admin/payments/register" element={<Navigate to="/admin/payments" replace />} />
            <Route path="/admin/payments/reports" element={<Navigate to="/admin/payments" replace />} />

            <Route path="/admin/loyalty/config" element={<LoyaltyConfig />} />
            <Route path="/admin/loyalty/rewards" element={<LoyaltyRewards />} />
            <Route path="/admin/loyalty/redemptions" element={<LoyaltyRedemptions />} />
            <Route path="/admin/loyalty/adjust" element={<LoyaltyAdjust />} />

            <Route path="/admin/reports/overview" element={<ReportsOverview />} />
            <Route path="/admin/reports/classes" element={<ReportsClasses />} />
            <Route path="/admin/reports/revenue" element={<ReportsRevenue />} />
            <Route path="/admin/reports/retention" element={<ReportsRetention />} />
            <Route path="/admin/reports/instructors/:id" element={<InstructorDetail />} />
            <Route path="/admin/reports/instructors" element={<ReportsInstructors />} />
            <Route path="/admin/reports/egresos" element={<ReportsEgresos />} />
            <Route path="/admin/reports/top-clients" element={<ReportsTopClients />} />
            <Route path="/admin/reports/revenue-by-type" element={<Navigate to="/admin/reports/revenue" replace />} />
            <Route path="/admin/reports/renewal-by-plan" element={<Navigate to="/admin/reports/retention" replace />} />
            <Route path="/admin/reports/coach-ranking" element={<Navigate to="/admin/reports/instructors" replace />} />
            <Route path="/admin/reports/cancellation-reasons" element={<Navigate to="/admin/reports/retention" replace />} />

            <Route path="/admin/settings/general" element={<GeneralSettings />} />
            <Route path="/admin/settings/studio" element={<StudioSettings />} />
            <Route path="/admin/settings/policies" element={<PoliciesSettings />} />
            <Route path="/admin/settings/cancellations" element={<AdminCancellationPolicy />} />
            <Route path="/admin/settings/notifications" element={<NotificationSettings />} />
            <Route path="/admin/settings/closed-days" element={<ClosedDays />} />
            <Route path="/admin/settings/whatsapp" element={<WhatsAppSettings />} />
            <Route path="/admin/settings" element={<Navigate to="/admin/settings/general" replace />} />

            {/* Migration History Route - Only for reports */}
            <Route path="/admin/migrations/history" element={<ClientMigrationPage />} />

            <Route path="/admin/facilities" element={<FacilitiesList />} />
            <Route path="/admin/facilities/:facilityId/layout" element={<FacilityLayoutEditor />} />
            <Route path="/admin/orders" element={<Navigate to="/admin/payments" replace />} />
            <Route path="/admin/orders/verification" element={<Navigate to="/admin/payments" replace />} />

            {/* POS System */}
            <Route path="/admin/pos" element={<POSPage />} />

            {/* Admin Routes — cash shifts, reports, reception, products (AuthGuard admin/super_admin) */}
            <Route element={<AuthGuard requiredRoles={['admin', 'super_admin']} allowElevated />}>
                <Route path="/admin/cash-shifts" element={<CashShiftsList />} />
                <Route path="/admin/cash-shifts/:id" element={<CashShiftDetail />} />
                <Route path="/admin/reports/sales-by-staff" element={<SalesByStaff />} />
                <Route path="/admin/reports/membership-movements" element={<MembershipMovements />} />
                <Route path="/admin/reception" element={<ReceptionStaffList />} />
                <Route path="/admin/products" element={<ProductsPage />} />
                <Route path="/admin/audit" element={<AuditLog />} />
                <Route path="/admin/commissions" element={<CommissionsPage />} />
                <Route path="/admin/payroll/coaches" element={<CoachPayrollPage />} />
                <Route path="/admin/substitutions" element={<SubstitutionsAdmin />} />
            </Route>

            {/* Admin Video Management */}
            <Route path="/admin/videos" element={<AdminVideoList />} />
            <Route path="/admin/videos/upload" element={<AdminVideoUpload />} />
            <Route path="/admin/videos/edit/:id" element={<AdminVideoUpload />} />
            <Route path="/admin/videos/sales" element={<VideoSalesVerification />} />

            {/* Reception Routes */}
            <Route element={<AuthGuard requiredRoles={['reception', 'admin', 'super_admin']} />}>
                <Route element={<ReceptionLayout />}>
                    <Route path="/reception" element={<ReceptionDashboardScreen />} />
                    <Route path="/reception/caja" element={<CajaScreen />} />
                    <Route path="/reception/vender" element={<PosScreen />} />
                    <Route path="/reception/inventario" element={<ReceptionInventoryScreen />} />
                    <Route path="/reception/checkin" element={<CheckinScreen />} />
                    <Route path="/reception/clientes" element={<ReceptionClientsScreen />} />
                    <Route path="/reception/reservas" element={<ReceptionBookingsScreen />} />
                    <Route path="/reception/historial" element={<ReceptionBookingHistoryScreen />} />
                    <Route path="/reception/lista-espera" element={<ReceptionWaitlistScreen />} />
                    <Route path="/reception/generar" element={<ReceptionGenerateWeekScreen />} />
                    <Route path="/reception/nomina" element={<ReceptionPayrollScreen />} />
                    <Route path="/reception/equipo" element={<ReceptionTeamScreen />} />
                    <Route path="/reception/aprobaciones" element={<ReceptionApprovalsScreen />} />
                    <Route path="/reception/whatsapp" element={<ReceptionWhatsAppScreen />} />
                    {/* Master-only: calendario y plantilla DENTRO del shell de recepción (sin AdminLayout) */}
                    <Route element={<AuthGuard requiredRoles={['admin', 'super_admin']} allowElevated />}>
                        <Route path="/reception/calendario" element={<ClassesCalendar embedded />} />
                        <Route path="/reception/plantilla" element={<WeeklySchedule embedded />} />
                    </Route>
                </Route>
            </Route>

            {/* Coach Routes */}
            <Route path="/coach/login" element={<CoachLogin />} />
            <Route path="/coach" element={<CoachDashboard />} />
            <Route path="/coach/schedule" element={<CoachSchedule />} />
            <Route path="/coach/class/:classId" element={<CoachClassDetail />} />
            <Route path="/coach/profile" element={<CoachProfile />} />
            <Route path="/coach/history" element={<CoachHistory />} />
            <Route path="/coach/substitutions" element={<CoachSubstitutions />} />
            <Route path="/coach/playlists" element={<CoachPlaylists />} />
            <Route path="/coach/templates" element={<CoachTemplates />} />
            <Route path="/coach/earnings" element={<CoachEarnings />} />

            {/* Legacy redirects */}
            <Route path="/admin/clients" element={<ClientsList />} />
            <Route path="/admin/clients/:id" element={<ClientDetail />} />
            <Route path="/admin/class-types" element={<Navigate to="/admin/classes/types" replace />} />
            <Route path="/admin/schedules" element={<Navigate to="/admin/classes/schedules" replace />} />
            <Route path="/admin/plans" element={<PlansList />} />
            <Route path="/admin/bookings/calendar" element={<Navigate to="/admin/calendar" replace />} />

            {/* Redirects */}
            <Route path="/client/dashboard" element={<Navigate to="/app" replace />} />
            <Route path="/auth/register" element={<Navigate to="/register" replace />} />
            <Route path="/auth/login" element={<Navigate to="/login" replace />} />
            <Route path="/client/book" element={<Navigate to="/app/book" replace />} />
            <Route path="/client/book/:classId" element={<LegacyClientBookRedirect />} />
            <Route path="/app/my-bookings" element={<Navigate to="/app/classes" replace />} />
            <Route path="/client/my-bookings" element={<Navigate to="/app/classes" replace />} />
            <Route path="/client/wallet" element={<Navigate to="/app/wallet" replace />} />
            <Route path="/client/profile" element={<Navigate to="/app/profile" replace />} />
            <Route path="/client/*" element={<Navigate to="/app" replace />} />
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <UpdatePrompt />
        </AuthInitializer>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
