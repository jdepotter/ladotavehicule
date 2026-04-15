import { NextRequest, NextResponse } from "next/server";
import { COLOR_CODES, MAKE_CODES, STYLE_CODES, ETIMS_BASE } from "@/lib/etimsCodes";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logEvent } from "@/lib/logger";

const MAX_PLATE_LEN = 8;
const MAX_STREET_LEN = 60;
const MAX_COMMENTS_LEN = 500;
function clamp(v: unknown, n: number): string {
  return typeof v === "string" ? v.trim().slice(0, n) : "";
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const ip = getClientIp(req);
    const limitError = checkRateLimit("submit", ip, {
      perHour: 5,
      perDay: 15,
      globalPerMinute: 10,
      globalPerDay: 500,
    });
    if (limitError) {
      logEvent({ type: "submit", ip, success: false, status: 429, meta: { rate_limited: true } });
      return NextResponse.json({ success: false, error: limitError }, { status: 429 });
    }

    const body = await req.json();

    // Input validation — reject obviously bad payloads before hitting LADOT.
    const plate = clamp(body.licensePlate, MAX_PLATE_LEN).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const streetName = clamp(body.streetName, MAX_STREET_LEN);
    const crossStreet = clamp(body.crossStreet, MAX_STREET_LEN);
    const comments = clamp(body.comments, MAX_COMMENTS_LEN);
    if (!plate || !streetName) {
      return NextResponse.json({ success: false, error: "Plate and street are required" }, { status: 400 });
    }

    // Step 1: Get session + TokenKey
    const formPageRes = await fetch(
      `${ETIMS_BASE}/pbw/include/la/complaintform.jsp?complainttype=1`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
    );

    const setCookieHeaders = formPageRes.headers.getSetCookie?.() ?? [];
    let sessionCookie = "";
    for (const c of setCookieHeaders) {
      if (c.includes("JSESSIONID")) {
        sessionCookie = c.split(";")[0];
        break;
      }
    }

    const formHtml = await formPageRes.text();
    const tokenMatch = formHtml.match(/name=["']TokenKey["']\s*value=["']([^"']+)["']/i);
    const tokenKey = tokenMatch?.[1] ?? "";

    if (!sessionCookie || !tokenKey) {
      console.error(`[submit] Session=${sessionCookie ? "OK" : "MISSING"} Token=${tokenKey ? "OK" : "MISSING"}`);
    }

    // Step 2: Map to ETIMS codes
    const colorCode = COLOR_CODES[body.vehicleColor] || "";
    const makeCode = MAKE_CODES[body.vehicleMake] || "";
    const styleCode = STYLE_CODES[body.vehicleStyle] || "";

    // Step 3: POST
    const formParams = new URLSearchParams({
      zipCode: clamp(body.zipCode, 5),
      streetNumber: clamp(body.blockNumber, 10),
      streetName,
      crossStreetName: crossStreet,
      vehicleColor: colorCode,
      vehicleMake: makeCode,
      vehicleStyle: styleCode,
      licState: clamp(body.plateState, 2).toUpperCase(),
      plate,
      vin: "",
      email: clamp(body.email, 120),
      comments,
      ...(body.previouslyReported ? { previouslyReported: "on" } : {}),
      ...(body.dwelling ? { dwelling: "Y" } : {}),
      submit: "Submit",
      clientcode: "17",
      complaintType: "A",
      meterNumber: "",
      meterLocation: "",
      signType: "",
      curbPaintColor: "",
      requestType: "submit",
      TokenKey: tokenKey,
    });

    const submitRes = await fetch(
      `${ETIMS_BASE}/pbw/parkingComplaintAction.doh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: sessionCookie,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          Origin: ETIMS_BASE,
          Referer: `${ETIMS_BASE}/pbw/parkingComplaintAction.doh`,
        },
        body: formParams.toString(),
        redirect: "follow",
      },
    );

    const responseText = await submitRes.text();

    // Parse response
    const errorMatches = responseText.match(/<li class="error">([^<]+)<\/li>/gi);
    const errors = errorMatches?.map((m) => m.replace(/<\/?li[^>]*>/gi, "").trim()) || [];
    const isThankYou = responseText.includes("Thank you for submitting");
    const hasForm = responseText.includes('name="complaintForm"');
    const success = isThankYou && !hasForm && errors.length === 0;

    const ms = Date.now() - start;
    console.log(`[submit] success=${success} plate=${plate} street="${streetName}" x "${crossStreet}" zip=${clamp(body.zipCode, 5)} errors=${errors.length ? errors.join(";") : "none"} ${ms}ms`);
    logEvent({
      type: "submit",
      ip,
      success,
      status: submitRes.status,
      duration_ms: ms,
      meta: {
        plate,
        state: clamp(body.plateState, 2).toUpperCase(),
        street: streetName,
        cross: crossStreet,
        zip: clamp(body.zipCode, 5),
        errors: errors.length ? errors : undefined,
      },
    });

    return NextResponse.json({
      success,
      status: submitRes.status,
      message: success
        ? "Report submitted to LADOT"
        : errors.length
          ? `LADOT rejected: ${errors.join("; ")}`
          : "Submission may have failed",
      errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[submit] error: ${message}`);
    logEvent({ type: "error", error: message, meta: { source: "submit" } });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
