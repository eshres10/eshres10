import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { ListReportsQueryParams, ListReportsResponse, ResolveReportBody, ResolveReportParams, ResolveReportResponse } from "@workspace/api-zod";
import { listReports, resolveReport } from "../access";
import { scoped } from "../lib/scoped";
import { viewerOf } from "../middlewares/auth";

// Report review for admins (ADMIN_USER_IDS). RLS checks app.is_admin too.
const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!viewerOf(req).isAdmin) {
    res.status(403).json({ error: "Admins only" });
    return;
  }
  next();
}

router.use("/admin", requireAdmin);

router.get("/admin/reports", scoped(async (req, res, db): Promise<void> => {
  const query = ListReportsQueryParams.safeParse(req.query);
  const reports = await listReports(db, viewerOf(req), query.success ? query.data.status ?? "open" : "open");
  res.json(ListReportsResponse.parse(reports ?? []));
}));

router.post("/admin/reports/:id/resolve", scoped(async (req, res, db): Promise<void> => {
  const params = ResolveReportParams.safeParse(req.params);
  const body = ResolveReportBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose remove or dismiss." });
    return;
  }
  const result = await resolveReport(db, viewerOf(req), params.data.id, body.data.action);
  if (!result.ok) {
    const [status, error] = {
      forbidden: [403, "Admins only"],
      not_found: [404, "Report not found"],
      cannot_remove: [400, "Profiles can't be removed here; dismiss the report or block the person."],
    }[result.error] as [number, string];
    res.status(status).json({ error });
    return;
  }
  res.json(ResolveReportResponse.parse(result.value));
}));

export default router;
