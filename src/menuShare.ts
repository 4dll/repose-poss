import { Category, MenuItem } from "./api";

type PublishedMenuPayload = {
  v: 1;
  c: [number, string][];
  i: [number, string, number, number, number | null][];
};

export type PublishedMenu = {
  categories: Category[];
  items: MenuItem[];
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return textDecoder.decode(await new Response(stream).arrayBuffer());
}

export async function encodePublishedMenu(categories: Category[], items: MenuItem[]) {
  const visibleCategories = categories.filter((category) =>
    items.some((item) => item.category_id === category.id)
  );
  const payload: PublishedMenuPayload = {
    v: 1,
    c: visibleCategories.map((category) => [category.id, category.name]),
    i: items.map((item) => [
      item.id,
      item.name,
      Number(item.price),
      Number(item.stock_qty),
      item.category_id,
    ]),
  };
  const json = JSON.stringify(payload);

  try {
    return `gz.${bytesToBase64Url(await gzip(json))}`;
  } catch {
    return `j.${bytesToBase64Url(textEncoder.encode(json))}`;
  }
}

export async function decodePublishedMenuFromHash(hash: string): Promise<PublishedMenu | null> {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const encoded = params.get("menu");
  if (!encoded) return null;

  const [kind, data] = encoded.split(".", 2);
  if (!kind || !data) return null;

  try {
    const json =
      kind === "gz"
        ? await gunzip(base64UrlToBytes(data))
        : textDecoder.decode(base64UrlToBytes(data));
    const payload = JSON.parse(json) as PublishedMenuPayload;
    if (payload.v !== 1) return null;

    const categories: Category[] = payload.c.map(([id, name], index) => ({
      id,
      name,
      sort_order: index + 1,
    }));
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const items: MenuItem[] = payload.i.map(([id, name, price, stockQty, categoryId]) => ({
      id,
      name,
      price,
      stock_qty: stockQty,
      category_id: categoryId,
      category_name: categoryId == null ? undefined : categoryNames.get(categoryId),
      cost_price: 0,
      low_stock_threshold: 0,
      active: 1,
      show_on_customer_menu: true,
      is_low_stock: 0,
    }));
    return { categories, items };
  } catch {
    return null;
  }
}
