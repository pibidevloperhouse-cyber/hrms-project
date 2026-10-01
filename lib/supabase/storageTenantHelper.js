/**
 * Storage Multi-Tenancy & Employee Folder Discovery Helper
 *
 * Provides clean, secure directory resolution inside Supabase Storage buckets.
 * Folder structure:
 *   [Bucket] -> [Company_Tenant_Folder] -> [Employee_Folder] -> [Context / Files]
 *
 * Features:
 *  1. Multi-tenant isolation: Each company's files are strictly compartmentalized by company.
 *  2. Existing Folder Discovery: Checks if the employee already has a folder inside the tenant.
 *     If found, reuses that exact folder instead of creating duplicates.
 *  3. Path Sanitization: Cleans names and filenames to prevent directory traversal and S3 key errors.
 */

/**
 * Returns a clean, sanitized company tenant folder name.
 * e.g. "Acme_Technologies_c1a2b3d4"
 */
export function getCompanyTenantFolderName(company) {
  const rawName = company?.name || company?.legal_name || "Company";
  const sanitized = rawName
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  const companyCode = company?.id ? company.id.slice(0, 8) : "default";
  return `${sanitized}_${companyCode}`;
}

/**
 * Sanitizes arbitrary file or path names.
 */
export function sanitizeFilename(filename = "file") {
  return filename
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_");
}

/**
 * Resolves or discovers an existing employee folder inside the company's tenant storage directory.
 *
 * @param {Object} params
 * @param {Object} params.adminSupabase - Supabase admin client
 * @param {string} params.bucketName - Target storage bucket name
 * @param {Object} params.company - Company tenant record
 * @param {Object} params.employeeProfile - Employee profile record
 * @param {Object} params.user - Supabase Auth User object
 * @returns {Promise<{ companyFolder: string, employeeFolder: string, fullFolderPath: string }>}
 */
export async function getOrCreateTenantEmployeeFolder({
  adminSupabase,
  bucketName,
  company,
  employeeProfile,
  user,
}) {
  const companyFolder = getCompanyTenantFolderName(company);

  const rawEmpName =
    employeeProfile?.full_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split("@")[0] : "Employee");

  const sanitizedEmpName = rawEmpName
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");

  const empCode =
    employeeProfile?.employee_id ||
    (employeeProfile?.id
      ? employeeProfile.id.slice(0, 6).toUpperCase()
      : user?.id?.slice(0, 6).toUpperCase() || "EMP");

  const canonicalEmpFolder = `${sanitizedEmpName}_${empCode}`;
  const empIdPrefix = employeeProfile?.id ? employeeProfile.id.slice(0, 6).toUpperCase() : "";

  let resolvedEmpFolder = canonicalEmpFolder;

  try {
    // List existing items inside this company's tenant folder
    const { data: existingList, error: listErr } = await adminSupabase.storage
      .from(bucketName)
      .list(companyFolder, { limit: 1000 });

    if (!listErr && Array.isArray(existingList) && existingList.length > 0) {
      // 1. Exact match with canonical folder name
      const exactMatch = existingList.find((item) => item.name === canonicalEmpFolder);
      if (exactMatch) {
        resolvedEmpFolder = exactMatch.name;
      } else {
        // 2. Match by Employee Code or ID prefix
        const idMatch = existingList.find(
          (item) =>
            item.name &&
            ((empCode && item.name.endsWith(`_${empCode}`)) ||
              (empIdPrefix && item.name.includes(`_${empIdPrefix}`)))
        );
        if (idMatch) {
          resolvedEmpFolder = idMatch.name;
        } else {
          // 3. Match by name prefix
          const nameMatch = existingList.find(
            (item) =>
              item.name &&
              (item.name === sanitizedEmpName || item.name.startsWith(`${sanitizedEmpName}_`))
          );
          if (nameMatch) {
            resolvedEmpFolder = nameMatch.name;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Storage tenant folder discovery notice:", err?.message);
  }

  return {
    companyFolder,
    employeeFolder: resolvedEmpFolder,
    fullFolderPath: `${companyFolder}/${resolvedEmpFolder}`,
  };
}
