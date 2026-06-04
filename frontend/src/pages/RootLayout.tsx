import SharedDashboardLayout from "@/components/layout/SharedDashboardLayout";
import { customerSidebarItems } from "@/config/sidebarConfigs";

export const RootLayout = () => {
  return (
    <SharedDashboardLayout 
      items={customerSidebarItems}
      profilePath="/profile"
      roleName="Customer"
    />
  );
};
