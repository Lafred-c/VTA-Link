// frontend/src/lib/database.ts
// DECOUPLED: All database access functions have been split into vertical module-specific services:
// - Auth: src/modules/auth/services/authDb.ts
// - CRM: src/modules/crm/services/crmDb.ts
// - Payroll: src/modules/payroll/services/payrollDb.ts
// - Inventory: src/modules/inventory/services/inventoryDb.ts
// - Admin: src/modules/admin/services/adminDb.ts
// - Operations (split by staff roles):
//   - Orders: src/modules/operations/services/orderDb.ts
//   - Cashier: src/modules/operations/services/cashierDb.ts
//   - Designer: src/modules/operations/services/designerDb.ts
//   - Production: src/modules/operations/services/productionDb.ts
//   - Payments: src/modules/operations/services/paymentDb.ts