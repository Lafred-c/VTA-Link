import SharedDashboardLayout from "@/components/layout/SharedDashboardLayout";
import { designerSidebarItems } from "@/config/sidebarConfigs";

const DesignerPage = () => {
  return (
    <SharedDashboardLayout 
      items={designerSidebarItems}
      profilePath="/designer/profile"
      roleName="Designer"
    />
  );
};

export default DesignerPage;