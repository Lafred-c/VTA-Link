import SharedDashboardLayout from "@/components/layout/SharedDashboardLayout";
import { adminSidebarItems } from "@/config/sidebarConfigs";

const AdminPage = () => {
  return (
    <SharedDashboardLayout 
      items={adminSidebarItems}
      profilePath="/admin/profile"
      roleName="Admin"
    />
  );
};

export default AdminPage;