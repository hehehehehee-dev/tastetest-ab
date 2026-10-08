import { createApi } from "../../server/api.mjs";
import { blobStore } from "../../server/storage.mjs";
export default async (request) => createApi(blobStore())(request);
export const config = { path: "/api/*" };
