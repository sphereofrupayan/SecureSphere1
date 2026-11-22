import { apiClient } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import { downloadAndShareAuthenticatedFile } from "./media";
import type { AdminUserRecord } from "@/types";

export async function getAdminUsers(): Promise<AdminUserRecord[]> {
  const { data } = await apiClient.get<{ users: AdminUserRecord[] }>(
    API_ENDPOINTS.ADMIN_USERS
  );
  return Array.isArray(data.users) ? data.users : [];
}

export async function createAdminUser(payload: {
  username: string;
  password: string;
}): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    API_ENDPOINTS.ADMIN_USERS,
    payload
  );
  return data;
}

export async function deleteAdminUser(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(
    API_ENDPOINTS.adminUserById(id)
  );
  return data;
}

export async function updateAdminUserPassword(
  id: number,
  password: string
): Promise<{ message: string }> {
  const { data } = await apiClient.put<{ message: string }>(
    API_ENDPOINTS.adminUserPassword(id),
    { password }
  );
  return data;
}

export async function updateAdminUserRole(
  id: number,
  isAdmin: boolean
): Promise<{ ok: boolean; username: string; isAdmin: boolean; message: string }> {
  const { data } = await apiClient.put<{
    ok: boolean;
    username: string;
    isAdmin: boolean;
    message: string;
  }>(API_ENDPOINTS.adminUserRole(id), { isAdmin });
  return data;
}

export async function exportAdminDatabase(format: "csv" | "pdf"): Promise<string> {
  const endpoint =
    format === "csv" ? API_ENDPOINTS.ADMIN_EXPORT_CSV : API_ENDPOINTS.ADMIN_EXPORT_PDF;
  const filename =
    format === "csv"
      ? "securesphere-database-export.csv"
      : "securesphere-database-export.pdf";
  const mimeType = format === "csv" ? "text/csv" : "application/pdf";
  return downloadAndShareAuthenticatedFile(endpoint, filename, mimeType);
}
