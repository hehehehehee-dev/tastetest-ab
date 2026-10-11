import { createApi } from "../../server/api.mjs";
import { blobStore } from "../../server/storage.mjs";
export default async (request) => {
  const aiEnabled = !!process.env.REPLICATE_API_TOKEN;
  return createApi(blobStore(), {
    proxyOptions: { aiEnabled },
    musicOptions: { aiEnabled },
  })(request);
};
export const config = { path: "/api/*" };
