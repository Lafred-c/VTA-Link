// frontend/src/App.tsx
// REFACTORED: Removed Redux — all state flows through Supabase hooks + AuthContext
// REFACTORED: All ProtectedRoute redirectTo now point to '/' 
import { lazy, Suspense } from 'react';

import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ProtectedRoute } from './modules/auth';

// Pages
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const AuthLayout = lazy(() => import('./modules/auth').then(m => ({ default: m.AuthLayout })));

// Customer
const RootLayout = lazy(() => import('./pages/RootLayout').then(m => ({ default: m.RootLayout })));
const CustomerPage = lazy(() => import('./pages/CustomerPage').then(m => ({ default: m.CustomerPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const CartPage = lazy(() => import('./pages/CartPage').then(m => ({ default: m.CartPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then(m => ({ default: m.MessagesPage })));

// Admin
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminDashboard = lazy(() => import('./modules/admin').then(m => ({ default: m.AdminDashboard })));
const AdminManagement = lazy(() => import('./modules/admin').then(m => ({ default: m.AdminManagement })));
const AdminOrders = lazy(() => import('./modules/operations').then(m => ({ default: m.AdminOrders })));
const AdminMessages = lazy(() => import('./modules/operations').then(m => ({ default: m.AdminMessages })));
const AdminInventory = lazy(() => import('./modules/inventory').then(m => ({ default: m.AdminInventory })));
const AdminPayroll = lazy(() => import('./modules/payroll').then(m => ({ default: m.AdminPayroll })));
const AdminAuditLogs = lazy(() => import('./modules/admin').then(m => ({ default: m.AdminAuditLogs })));

// Cashier
const CashierPage = lazy(() => import('./pages/CashierPage'));
const CashierDashboard = lazy(() => import('./modules/operations').then(m => ({ default: m.CashierDashboard })));
const CashierOrders = lazy(() => import('./modules/operations').then(m => ({ default: m.CashierOrders })));
const CashierInventory = lazy(() => import('./modules/inventory').then(m => ({ default: m.CashierInventory })));

// Designer
const DesignerPage = lazy(() => import('./pages/DesignerPage'));
const DesignerDashboard = lazy(() => import('./modules/operations').then(m => ({ default: m.DesignerDashboard })));
const DesignerOrders = lazy(() => import('./modules/operations').then(m => ({ default: m.DesignerOrders })));

// Production
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const ProductionDashboard = lazy(() => import('./modules/operations').then(m => ({ default: m.ProductionDashboard })));
const ProductionOrders = lazy(() => import('./modules/operations').then(m => ({ default: m.ProductionOrders })));
const ProductionInventory = lazy(() => import('./modules/inventory').then(m => ({ default: m.ProductionInventory })));

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const router = createBrowserRouter([

  // ── PUBLIC ──────────────────────────────────────────────────────────────
  { path: '/',                element: <LandingPage /> },
  {
    element: <AuthLayout />,
    children: [
      { path: '/signup', element: <SignUpPage /> },
      { path: '/login',  element: <LoginPage /> },
    ]
  },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password',  element: <ResetPasswordPage /> },
  // /staff-login REMOVED — unified LoginModal on landing page handles all roles

  // ── CUSTOMER (role: customer) ────────────────────────────────────────────
  {
    element: <ProtectedRoute allowedRoles={['customer']} redirectTo='/'><RootLayout /></ProtectedRoute>,
    children: [
      { path: 'customer',  element: <CustomerPage /> },
      { path: 'profile',   element: <ProfilePage /> },
      { path: 'cart',      element: <CartPage /> },
      { path: 'orders',    element: <OrdersPage /> },
      { path: 'messages',  element: <MessagesPage /> },
    ],
  },

  // ── ADMIN (role: admin) ──────────────────────────────────────────────────
  {
    path: '/admin',
    element: <ProtectedRoute allowedRoles={['admin']} redirectTo='/'><AdminPage /></ProtectedRoute>,
    children: [
      { index: true,       element: <AdminDashboard /> },
      { path: 'users',     element: <AdminManagement /> },
      { path: 'orders',    element: <AdminOrders /> },
      { path: 'messages',  element: <AdminMessages /> },
      { path: 'inventory', element: <AdminInventory /> },
      { path: 'payroll',   element: <AdminPayroll /> },
      { path: 'profile',   element: <ProfilePage /> },
      { path: 'logs',      element: <AdminAuditLogs /> },
    ],
  },

  // ── CASHIER (role: cashier) ──────────────────────────────────────────────
  {
  path: '/cashier',
  element: <ProtectedRoute allowedRoles={['cashier']} redirectTo='/'><CashierPage /></ProtectedRoute>,
  children: [
    { index: true,       element: <CashierDashboard /> },
    { path: 'orders',    element: <CashierOrders /> },
    { path: 'inventory', element: <CashierInventory /> },
    { path: 'profile',   element: <ProfilePage /> },
    { path: 'messages',  element: <AdminMessages /> },
  ],
},

  // ── DESIGNER (role: designer) ────────────────────────────────────────────
  {
  path: '/designer',
  element: <ProtectedRoute allowedRoles={['designer']} redirectTo='/'><DesignerPage /></ProtectedRoute>,
  children: [
    { index: true,    element: <DesignerDashboard /> },
    { path: 'orders', element: <DesignerOrders /> },
    { path: 'profile', element: <ProfilePage /> },
    { path: 'messages', element: <AdminMessages /> }, // Designers can use the staff messaging UI
    ],
  },

  // ── PRODUCTION (role: production) ────────────────────────────────────────
  {
    path: '/production',
    element: <ProtectedRoute allowedRoles={['production']} redirectTo='/'><ProductionPage /></ProtectedRoute>,
    children: [
      { index: true,       element: <ProductionDashboard /> },
      { path: 'orders',    element: <ProductionOrders /> },
      { path: 'inventory', element: <ProductionInventory /> },
      { path: 'profile',   element: <ProfilePage /> },
      { path: 'messages',  element: <AdminMessages /> },
    ],
  },

  // ── 404 ─────────────────────────────────────────────────────────────────
  { path: '*', element: <div className='p-10 text-center text-red-500 text-xl font-bold'>404 — Page Not Found</div> },
]);

const App = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <RouterProvider router={router} />
  </Suspense>
);

export default App;