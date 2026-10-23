// Thin fetch wrapper. GET when no body; mutations always send JSON (the backend rejects anything else).
export async function api(path, data, method = 'POST') {
  const response = await fetch(path, data === undefined ? {} : {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `Хүсэлт амжилтгүй (${response.status})`);
  return value;
}

export const get = path => api(path);

export async function post(path, body) {
  return api(path, body, 'POST');
}

export async function patch(path, body) {
  return api(path, body, 'PATCH');
}

export async function remove(path, body = {}) {
  return api(path, body, 'DELETE');
}

// Waits for a background route rebuild to settle, so the caller only reloads
// once the new graph is actually in place.
export async function waitForJob(jobId, onTick) {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 600));
    const status = await get(`/api/jobs/${jobId}`);
    onTick?.(status);
    if (status.status !== 'running') {
      if (status.status === 'failed') throw new Error(status.message || 'Ажил дуусаагүй.');
      return status;
    }
  }
}
