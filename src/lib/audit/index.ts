export {
  runWithAuditContext,
  getAuditContext,
  requireAuditContext,
  getOrSystemContext,
  type AuditContext,
} from "./context";

export { audit, shallowDiff, type AuditEventInput } from "./log";
export { actionLabel, knownActions } from "./labels";
export {
  auditWrap,
  withFixedActor,
  buildAuditContextFromRequest,
} from "./route-wrapper";

export { maskPhone, maskEmail, truncateMessage } from "./pii";
