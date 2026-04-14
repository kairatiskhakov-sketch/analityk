export async function fetcher<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}
