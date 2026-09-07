import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { RoutePermissionGuard } from "@/components/layout/route-permission-guard";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <RoutePermissionGuard>
        <AppShell>{children}</AppShell>
      </RoutePermissionGuard>
    </ProtectedRoute>
  );
}