export { default as AdminInventory } from './components/AdminInventory';
export { default as CashierInventory } from './components/CashierInventory';
export { default as ProductionInventory } from './components/ProductionInventory';

// Shared Subcomponents (Named Exports)
export { DeliveryDetailsModal } from './components/shared/DeliveryDetailsModal';
export { EditMaterialModal } from './components/shared/EditMaterialModal';
export { EditProductModal } from './components/shared/EditProductModal';
export { MaterialDetailsModal } from './components/shared/MaterialDetailsModal';
export { MaterialsTable } from './components/shared/MaterialsTable';
export { ProductDetailsModal } from './components/shared/ProductDetailsModal';
export { ProductsTable } from './components/shared/ProductsTable';
export { DeleteMaterialModal } from './components/shared/DeleteMaterialModal';
export { DeleteProductModal } from './components/shared/DeleteProductModal';

// Hooks
export { useInventoryData, useDeliveries } from './hooks/useInventory';
export { inventoryDb } from './services/inventoryDb';

// Helpers and Configurations
export * from './inventory.types';
export * from './inventory.constants';
export * from './inventory.utils';
