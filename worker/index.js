export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/risk") {
      const data = await env.DASHBOARD_SNAPSHOTS.get("risk");
      return new Response(data, {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/events") {
      const data = await env.DASHBOARD_SNAPSHOTS.get("events");
      return new Response(data, {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      service: "hormuz-worker",
      endpoints: ["/api/risk","/api/events"]
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}
