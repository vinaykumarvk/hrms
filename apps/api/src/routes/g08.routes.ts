import { ApiKernel, accepted, created, ok } from "../http/apiKernel";
import { optionalBoolean, optionalString, readBodyRecord, requiredString } from "../http/body";
import { RouteDefinition } from "../http/apiTypes";
import { ph03Ids } from "../seed/ph03Seed";

export const g08RouteEvidence = {
  forms: "/api/v1/apar/forms",
  report: "/api/v1/apar/forms/{id}:report",
  review: "/api/v1/apar/forms/{id}:review",
  accept: "/api/v1/apar/forms/{id}:accept",
  postSr: "/api/v1/apar/forms/{id}:post-sr",
  markers: ["APAR_FINAL_GRADE", "SEALED_COVER", "G08_G06_FEED_SUPPRESSED"],
};

export function registerG08Routes(kernel: ApiKernel): void {
  const routes: RouteDefinition[] = [
    {
      method: "POST",
      path: "/api/v1/apar/forms",
      operationId: "g08.openForm",
      protected: true,
      permission: "g08.apar.form.open",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return created({
          form: context.services.apar.openForm(context.actor, {
            employeeId: optionalString(body, "employeeId") ?? ph03Ids.employee,
            periodStart: requiredString(body, "periodStart"),
            periodEnd: requiredString(body, "periodEnd"),
            reportingOfficerId: optionalString(body, "reportingOfficerId") ?? ph03Ids.manager,
            reviewingOfficerId: optionalString(body, "reviewingOfficerId") ?? ph03Ids.manager,
            acceptingAuthorityId: optionalString(body, "acceptingAuthorityId") ?? ph03Ids.manager,
            underCharge: optionalBoolean(body, "underCharge"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:submit-self",
      operationId: "g08.submitSelf",
      protected: true,
      permission: "g08.apar.self.submit",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => accepted({ form: context.services.apar.submitSelf(context.actor, requiredParam(context.params, "id")) }),
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:report",
      operationId: "g08.recordReporting",
      protected: true,
      permission: "g08.apar.report",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          form: context.services.apar.recordReporting(context.actor, requiredParam(context.params, "id"), {
            grade: requiredString(body, "grade"),
            narrative: requiredString(body, "narrative"),
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:review",
      operationId: "g08.recordReview",
      protected: true,
      permission: "g08.apar.review",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({
          form: context.services.apar.recordReview(context.actor, requiredParam(context.params, "id"), {
            concur: optionalBoolean(body, "concur") ?? true,
            remarks: optionalString(body, "remarks") ?? "Reviewed",
          }),
        });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:accept",
      operationId: "g08.accept",
      protected: true,
      permission: "g08.apar.accept",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ form: context.services.apar.accept(context.actor, requiredParam(context.params, "id"), { finalGrade: requiredString(body, "finalGrade") }) });
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:post-sr",
      operationId: "g08.postFinalGrade",
      protected: true,
      permission: "g08.apar.post_sr",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted(
          context.services.apar.postFinalGrade(context.actor, requiredParam(context.params, "id"), {
            eventDate: requiredString(body, "eventDate"),
            idempotencyKey: requiredString({ key: context.idempotencyKey }, "key"),
          })
        );
      },
    },
    {
      method: "POST",
      path: "/api/v1/apar/forms/{id}:release-sealed-cover",
      operationId: "g08.releaseSealedCover",
      protected: true,
      permission: "g08.apar.sealed.release",
      unsafe: true,
      requiresIdempotencyKey: true,
      handler: (context) => {
        const body = readBodyRecord(context.request.body);
        return accepted({ form: context.services.apar.releaseSealedCover(context.actor, requiredParam(context.params, "id"), { reason: requiredString(body, "reason") }) });
      },
    },
    {
      method: "GET",
      path: "/api/v1/apar/summary",
      operationId: "g08.summary",
      protected: true,
      permission: "g08.apar.read",
      handler: (context) => ok(context.services.apar.summary(context.scope)),
    },
  ];
  routes.forEach((route) => kernel.register(route));
}

function requiredParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) {
    throw new Error(`Missing route parameter ${key}`);
  }
  return value;
}
