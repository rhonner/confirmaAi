import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

export const APP_TIMEZONE = "America/Sao_Paulo";

export function nowInAppTz(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE);
}

export function toAppTz(utc: Date): Date {
  return toZonedTime(utc, APP_TIMEZONE);
}

export function fromAppTz(zoned: Date): Date {
  return fromZonedTime(zoned, APP_TIMEZONE);
}

export function startOfDayInAppTz(yyyyMmDd: string): Date {
  return fromZonedTime(`${yyyyMmDd}T00:00:00.000`, APP_TIMEZONE);
}

export function endOfDayInAppTz(yyyyMmDd: string): Date {
  return fromZonedTime(`${yyyyMmDd}T23:59:59.999`, APP_TIMEZONE);
}

export function todayIsoInAppTz(): string {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

export { formatInTimeZone };
