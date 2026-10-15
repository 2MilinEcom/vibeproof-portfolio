import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { importReviewCsv, manualBatchId, MAX_IMPORT_BYTES } from "../lib/review-import.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const jobs = await prisma.importJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    jobs: jobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file." };
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, message: "CSV files must be 5 MB or smaller." };
  }

  try {
    const csvText = await file.text();
    const result = await importReviewCsv({
      shop: session.shop,
      filename: file.name,
      csvText,
      externalBatchId: manualBatchId(csvText),
    });
    return { ok: true, message: result.message };
  } catch {
    return { ok: false, message: "Import failed. Check the import history for details." };
  }
};


export default function ImportsPage() {
  const { jobs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Imports">
      {actionData?.message && (
        <s-banner tone={actionData.ok ? "success" : "critical"}>
          {actionData.message}
        </s-banner>
      )}

      <s-section heading="Import review CSV">
        <s-paragraph>
          Import up to 5,000 reviews at a time. Required columns are product_handle
          or product_id, rating, body, and reviewer_name. Optional columns include
          title, reviewer_email, product_title, variant_title, verified_purchase,
          status, and created_at.
        </s-paragraph>

        <Form method="post" encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            <input type="file" name="file" accept=".csv,text/csv" required />
            <s-button type="submit" variant="primary">Import CSV</s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Import behavior">
        <s-paragraph>
          Imported reviews use source IMPORT. Status defaults to APPROVED unless a
          row explicitly says PENDING. AI demo content is never created by imports,
          and imports never create Verified purchase status unless the CSV explicitly
          marks the row as verified.
        </s-paragraph>
      </s-section>

      <s-section heading="Import history" padding="none">
        {jobs.length === 0 ? (
          <s-box padding="base"><s-text color="subdued">No imports yet.</s-text></s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>File</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header format="numeric">Rows</s-table-header>
              <s-table-header format="numeric">Imported</s-table-header>
              <s-table-header format="numeric">Skipped</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {jobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.filename}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "critical" : "info"}>
                      {job.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{String(job.totalRows)}</s-table-cell>
                  <s-table-cell>{String(job.importedRows)}</s-table-cell>
                  <s-table-cell>{String(job.skippedRows)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
