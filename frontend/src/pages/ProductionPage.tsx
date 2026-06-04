import SharedDashboardLayout from "@/components/layout/SharedDashboardLayout";
import { productionSidebarItems } from "@/config/sidebarConfigs";

const ProductionPage = () => {
  return (
    <SharedDashboardLayout 
      items={productionSidebarItems}
      profilePath="/production/profile"
      roleName="Production"
    />
  );
};

export default ProductionPage;