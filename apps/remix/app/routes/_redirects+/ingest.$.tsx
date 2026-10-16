// Older browser sessions may still call this endpoint. Never forward analytics externally.
const rejectAnalytics = () => new Response(null, { status: 404 });

export const loader = rejectAnalytics;
export const action = rejectAnalytics;
