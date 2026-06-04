export { default as AdminDashboard } from './components/AdminDashboard';
export { default as AdminManagement } from './components/AdminManagement';
export { default as AdminAuditLogs } from './components/AdminAuditLogs';
export { default as AdminProducts } from './components/AdminProducts';

// Hooks
export {
  useMyProfile,
  useUsers,
  useEmployees,
  useSuppliers,
  useProducts,
  useManagementData,
  useDashboard,
  useDashboardData,
  useProductsData,
  useLogsData,
} from './hooks/useAdmin';
export { adminDb } from './services/adminDb';

// Helpers and Configurations
export * from './admin.types';
export * from './admin.constants';
export * from './admin.utils';
