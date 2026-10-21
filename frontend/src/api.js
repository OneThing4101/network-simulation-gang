// Thin fetch wrapper. GET when no body; mutations always send JSON (the backend rejects anything else).
export async function api(path, data, method = 'POST') {
  const response = await fetch(path, data === undefined ? {} : {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `Хүсэлт амжилтгүй (${response.status})`);
  return value;
}
