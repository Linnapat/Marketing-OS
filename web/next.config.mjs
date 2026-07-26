/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Approval Queue was folded into the Status Board. Its only source was
      // the `requests` table, every row of which mirrors an expense_request,
      // so the board's Expense lane already covers it. Redirect rather than
      // 404 so old links and bookmarks land somewhere useful.
      { source: "/approvals", destination: "/status", permanent: true },
    ];
  },
};
export default nextConfig;
