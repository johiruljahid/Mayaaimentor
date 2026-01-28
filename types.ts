
export type UserRole = 'user' | 'admin' | 'guest';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  credits: number;
  role: UserRole;
  referralCode: string;
  walletBalance: number;
  pendingCommission: number;
  totalCommissionEarned: number;
  referralCount: number;
  usedCoupon?: string;
  createdAt?: any;
  // Custom Referral Settings
  customDiscount?: number;     // Percentage discount for buyer
  customCommission?: number;   // Percentage commission for referrer
  paymentMethod?: 'Bkash' | 'Nagad';
  paymentNumber?: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  description: string;
}

export interface PurchaseRequest {
  id: string;
  uid: string;
  userName: string;
  packageName: string;
  credits: number;
  amount: number;
  transactionId: string;
  couponCode: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
  approvedAt?: any;
}

export type Language = 'English' | 'German';

export interface CallState {
  isActive: boolean;
  language: Language | null;
}
