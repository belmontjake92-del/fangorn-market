import { arbitrumSepolia } from "viem/chains";

/**
 * POST an x402 request to the facilitator. The wire protocol is standard x402
 * (`paymentPayload` + `paymentRequirements`); the Fangorn-specific fields ride
 * in `paymentRequirements.extra`.
 */
async function postExtra(baseUrl: string, path: string, extra: object): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      {
        paymentPayload: { x402Version: 2 },
        paymentRequirements: { scheme: "exact", network: `eip155:${arbitrumSepolia.id}`, extra },
      },
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
    ),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`facilitator ${path} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

// The registry's AlreadyRegistered custom error (selector) - register() bundles
// the ERC-3009 payment atomically, so a revert here means no re-charge. On a
// repeat buy by the same identity this is expected; treat it as success and let
// the caller proceed to settle/decrypt against the existing registration.
const ALREADY_REGISTERED_MARKERS = ["AlreadyRegistered", "0x3a81d6fc"];

/**
 * /verify → register: relays the buyer's atomic payment + identity commitment.
 * Returns `alreadyRegistered` so the caller knows whether a real payment
 * happened this call (fresh register = paid; AlreadyRegistered = no charge).
 */
export async function verifyRegister(
  facilitatorUrl: string,
  extra: object,
): Promise<{ alreadyRegistered: boolean }> {
  const body = await postExtra(facilitatorUrl, "/verify", extra);
  // x402 VerifyResponse rides at HTTP 200 even when invalid.
  if (body.isValid === false || body.valid === false) {
    const reason = JSON.stringify(body);
    if (ALREADY_REGISTERED_MARKERS.some((m) => reason.includes(m))) return { alreadyRegistered: true };
    throw new Error(`/verify (register) rejected: ${reason}`);
  }
  return { alreadyRegistered: false };
}

/** /settle → claim: relays the Semaphore proof; returns the nullifier in extensions. */
export async function settleClaim(facilitatorUrl: string, extra: object): Promise<Record<string, unknown>> {
  const body = await postExtra(facilitatorUrl, "/settle", extra);
  if (body.success === false) {
    throw new Error(`/settle (claim) failed: ${JSON.stringify(body)}`);
  }
  return body;
}
