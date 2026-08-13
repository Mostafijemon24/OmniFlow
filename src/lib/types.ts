export type ConsultationSlot = {
  id: string;
  startsAt: string;
  booked: boolean;
};

export type Product = {
  id: string;
  title: string;
  type: "digital_file" | "consultation";
  price: number;
  currency: string;
  badge: string | null;
  description: string;
  thumbnail: string | null;
  active: boolean;
  fileKey: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMime: string | null;
  meetingLink: string | null;
  durationMinutes: number | null;
  salesCount: number;
  slots?: ConsultationSlot[];
};

export type Profile = {
  id: string;
  email: string;
  fullName: string;
  username: string;
  headline: string | null;
  bio: string | null;
  avatar: string | null;
  cover: string | null;
  category: string | null;
  primaryGoal: string | null;
  onboardingCompleted?: boolean;
  plan?: string;
  planName?: string;
  planStatus?: string;
  planPeriodEnd?: string | null;
  planNotice?: { level: "active" | "expiring" | "expired"; message: string } | null;
  effectivePlanName?: string;
  trialDaysLeft?: number;
  maxProducts?: number | null;
  productCount?: number;
  metaAccounts?: number;
  isSuperAdmin?: boolean;
};

export type ManualPayment = {
  id: string;
  plan: string | null;
  trxId: string;
  amountCents: number;
  currency: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type MetaAccount = {
  id: string;
  pageId: string;
  pageName: string;
  platform: string;
  igUserId: string | null;
  subscribed: boolean;
  needsReconnect: boolean;
  tokenExpiresAt: string | null;
};

export type AutoRule = {
  id: string;
  platform: string;
  keyword: string;
  targetProductId: string;
  autoMessage: string;
  triggerCount: number;
  active: boolean;
  targetProduct?: { id: string; title: string; price: number; currency: string };
  metaAccount?: { id: string; pageName: string; platform: string; subscribed: boolean } | null;
};

export type CurrencyTotal = { currency: string; cents: number };

export type OrderRow = {
  id: string;
  customerName: string;
  customerEmail: string;
  productTitle: string;
  productType: string;
  price: string;
  gateway: string;
  status: string;
  deliveredAt: string | null;
  deliveryStatus: string | null;
  deliveryDetail: string | null;
  downloadUrl: string | null;
  downloadExpiresAt: string | null;
  downloadsLeft: number | null;
  bookingStartsAt: string | null;
  createdAt: string;
};

export type OrdersResponse = {
  total: number;
  truncated: boolean;
  revenue: CurrencyTotal[];
  orders: OrderRow[];
};

export type Analytics = {
  days: number;
  commentsDetected: number;
  autoDmsSent: number;
  autoDmsFailed: number;
  bioVisits: number;
  ordersClosed: number;
  revenue: CurrencyTotal[];
  avgDmLatencyMs: number | null;
  commentToOrderRate: number | null;
  visitToOrderRate: number | null;
  dmQuota: { used: number; limit: number | null; planName: string };
  recentDms: Array<{
    id: string;
    platform: string;
    keyword: string;
    status: string;
    error: string | null;
    latencyMs: number | null;
    createdAt: string;
  }>;
};
