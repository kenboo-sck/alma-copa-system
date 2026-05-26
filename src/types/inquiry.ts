export type InquiryType = "entry" | "payment" | "event" | "other" | "";
export type InquiryStatus = "unhandled" | "in_progress" | "resolved";

export type InquiryDocument = {
  inquiryId: string;
  name: string;
  email: string;
  phone: string | null;
  inquiryType: InquiryType;
  message: string;
  status: InquiryStatus;
  adminNotified: boolean;
  userNotified: boolean;
  emailError: string | null;
  createdAt: Date;
  updatedAt: Date;
};
