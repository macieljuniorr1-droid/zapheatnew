// Aciona o motor de grupos do WhatsApp sob demanda (envio imediato).
export async function fireGroupTick(groupId: string, once = true) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const origin = new URL(getRequest().url).origin;
  const res = await fetch(`${origin}/api/public/hooks/wa-group-tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, once }),
  });
  return (await res.json().catch(() => ({}))) as any;
}
