/**
 * @terrastruct/d2 compile failures reject with an Error whose message is a raw
 * JSON array of {range, errmsg} objects, e.g.
 *   [{"range":"index,0:0:0-0:4:4","errmsg":"index:1:1: connection missing destination"}]
 * Detect that shape and rethrow with one readable line per errmsg
 * ("d2 compile error: index:1:1: connection missing destination"); any other
 * error passes through unchanged. Applied at the throw site in runValidate /
 * runInspect so every consumer (including the bin's fatal paths) sees the
 * readable form.
 */
export function toReadableD2Error(err: unknown): unknown {
  if (!(err instanceof Error)) return err;
  const errmsgs = parseD2Errmsgs(err.message);
  if (!errmsgs) return err;
  return new Error(errmsgs.map((m) => `d2 compile error: ${m}`).join("\n"), { cause: err });
}

function parseD2Errmsgs(message: string): string[] | null {
  if (!message.startsWith("[")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const errmsgs: string[] = [];
  for (const item of parsed) {
    if (typeof (item as { errmsg?: unknown })?.errmsg !== "string") return null;
    errmsgs.push((item as { errmsg: string }).errmsg);
  }
  return errmsgs;
}
