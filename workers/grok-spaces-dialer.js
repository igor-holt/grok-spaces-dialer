/**
 * Public tool webhook for Grok Spaces Dialer.
 * Live at https://grok-spaces-dialer.iholt.workers.dev
 */
const USERS = {
  "2244994945": { id: "2244994945", name: "DevRel Demo", username: "DemoHost" },
  "44196397": { id: "44196397", name: "Elon Musk", username: "elonmusk" },
  "12": { id: "12", name: "jack", username: "jack" },
  "783214": { id: "783214", name: "Sky AU", username: "sky_au" },
  "9001": { id: "9001", name: "Grok Voice", username: "grok" },
};

export default {
  async fetch(request) {
    return new Response(JSON.stringify({ status: "see deployed worker" }), { headers: { "content-type": "application/json" } });
  }
};
