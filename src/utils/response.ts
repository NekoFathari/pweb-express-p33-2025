export type ApiSuccess<T> = { success: true; message: string; data: T; meta?: any };
export type ApiError = { success: false; message: string; data?: undefined };
export const ok = <T>(message: string, data: T, meta?: any): ApiSuccess<T> => ({ success: true, message, data, meta });
export const fail = (message: string): ApiError => ({ success: false, message });
