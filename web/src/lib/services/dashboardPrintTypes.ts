export type DashboardPrintKind = "deliveries" | "returns";
export type DashboardPrintScope = "due" | "all";

export type PrintDressRow = {
  label: string;
  price: number;
  fitting: number;
  advance: number;
  remaining: number;
  notes: string;
  deliveryNote: string;
  remainingCollected: number;
  securityCollected: number;
  status: string;
};

export type PrintOrderRow = {
  description: string;
  cost: number;
  advance: number;
  balance: number;
  due: string;
};

export type PrintBookingRecord = {
  id: number;
  serial: string;
  customerName: string;
  address: string;
  contact1: string;
  contact2: string;
  whatsapp: string;
  venue: string;
  staffNames: string;
  bookedOn: string;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  deliveredAt: string;
  isOverdue: boolean;
  status: string;
  commonNotes: string;
  deliveryNotes: string;
  dresses: PrintDressRow[];
  orders: PrintOrderRow[];
  totalRent: number;
  totalFitting: number;
  totalAdvance: number;
  advanceMode: string;
  totalRemaining: number;
  remainingCollected: number;
  remainingMode: string;
  balanceLeft: number;
  securityDeposit: number;
  securityCollected: number;
  securityMode: string;
};
