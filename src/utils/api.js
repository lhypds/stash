async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const searchApps = (term, platform, country = "us") =>
  request(`/api/search?platform=${platform}&country=${country}&term=${encodeURIComponent(term)}`);

export const ensureUser = (username) => request(`/api/users/${username}`, { method: "POST" });

export const getSettings = (username) => request(`/api/users/${username}/settings`);

export const saveSettings = (username, settings) =>
  request(`/api/users/${username}/settings`, json("PUT", { settings }));

export const getStash = (username) => request(`/api/users/${username}/stash`);

export const stashApp = (username, app) => request(`/api/users/${username}/apps`, json("POST", app));

export const updateApp = (username, platform, bundleId, patch) =>
  request(`/api/users/${username}/apps/${platform}/${encodeURIComponent(bundleId)}`, json("PATCH", patch));

export const removeApp = (username, platform, bundleId) =>
  request(`/api/users/${username}/apps/${platform}/${encodeURIComponent(bundleId)}`, { method: "DELETE" });
